import type CDP from "chrome-remote-interface";

const DEFAULT_TIMEOUT_MS = 30_000;

export async function navigate(client: CDP.Client, url: string): Promise<void> {
  await client.Page.enable();
  const [, frameResult] = await Promise.all([
    client.Page.loadEventFired(),
    client.Page.navigate({ url }),
  ]);

  if (frameResult.errorText) {
    throw new Error(`Navigation failed: ${frameResult.errorText}`);
  }
}

export async function click(client: CDP.Client, nodeId: string): Promise<void> {
  await client.DOM.enable();

  // Resolve AX nodeId to DOM backendNodeId, then to a JS object we can get coordinates from
  const { result } = await client.Runtime.evaluate({
    expression: `
      (function() {
        const node = document.querySelector('[data-ax-node-id="${nodeId}"]');
        if (node) {
          const rect = node.getBoundingClientRect();
          return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
        }
        return null;
      })()
    `,
  });

  // If the data attribute approach doesn't work, try resolving via Accessibility backend
  let x: number;
  let y: number;

  if (result.value && result.value !== "null") {
    const coords = JSON.parse(result.value as string);
    x = coords.x;
    y = coords.y;
  } else {
    // Fallback: resolve via DOM.resolveNode using backendNodeId
    const { object } = await client.DOM.resolveNode({ backendNodeId: Number(nodeId) });
    if (!object.objectId) throw new Error(`Cannot resolve node ${nodeId}`);

    const boxResult = await client.Runtime.callFunctionOn({
      objectId: object.objectId,
      functionDeclaration: `function() {
        const rect = this.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }`,
      returnByValue: true,
    });

    const coords = boxResult.result.value as { x: number; y: number };
    x = coords.x;
    y = coords.y;
  }

  await client.Input.dispatchMouseEvent({ type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await client.Input.dispatchMouseEvent({ type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

export async function fill(client: CDP.Client, nodeId: string, text: string): Promise<void> {
  await client.DOM.enable();

  // Focus the element via DOM.focus using backendNodeId
  await client.DOM.focus({ backendNodeId: Number(nodeId) });

  // Clear existing content
  await client.Runtime.evaluate({
    expression: `document.activeElement && (document.activeElement.value = '')`,
  });

  // Type the text character by character
  for (const char of text) {
    await client.Input.dispatchKeyEvent({ type: "keyDown", text: char });
    await client.Input.dispatchKeyEvent({ type: "keyUp", text: char });
  }
}

export async function screenshot(client: CDP.Client): Promise<Buffer> {
  const { data } = await client.Page.captureScreenshot({ format: "png" });
  return Buffer.from(data, "base64");
}

export async function evaluate(client: CDP.Client, expression: string): Promise<unknown> {
  const { result, exceptionDetails } = await client.Runtime.evaluate({
    expression,
    returnByValue: true,
    awaitPromise: true,
  });

  if (exceptionDetails) {
    throw new Error(`Evaluation error: ${exceptionDetails.text ?? exceptionDetails.exception?.description ?? "unknown"}`);
  }

  return result.value;
}

export async function waitForSelector(
  client: CDP.Client,
  selector: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  await client.DOM.enable();

  const start = Date.now();
  const pollInterval = 100;

  while (Date.now() - start < timeoutMs) {
    const { root } = await client.DOM.getDocument();
    const { nodeId } = await client.DOM.querySelector({ nodeId: root.nodeId, selector });
    if (nodeId !== 0) return;
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error(`waitForSelector("${selector}") timed out after ${timeoutMs}ms`);
}
