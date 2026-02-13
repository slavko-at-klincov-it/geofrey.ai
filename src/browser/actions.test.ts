import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Use a plain object mock that we cast only at the call site.
// We intentionally use `any` in mocks to avoid fighting CDP's complex generic types.
function createMockClient() {
  return {
    Page: {
      enable: mock.fn(async () => {}),
      loadEventFired: mock.fn(async () => ({})),
      navigate: mock.fn(async (_params: any) => ({ frameId: "frame-1", loaderId: "loader-1" }) as any),
      captureScreenshot: mock.fn(async () => ({ data: Buffer.from("fake-png").toString("base64") })),
    },
    DOM: {
      enable: mock.fn(async () => {}),
      getDocument: mock.fn(async () => ({ root: { nodeId: 1 } })),
      querySelector: mock.fn(async (_params: any) => ({ nodeId: 42 })),
      focus: mock.fn(async () => {}),
      resolveNode: mock.fn(async () => ({
        object: { objectId: "obj-1" },
      })),
    },
    Runtime: {
      evaluate: mock.fn(async (_params: any): Promise<any> => ({
        result: { value: null },
      })),
      callFunctionOn: mock.fn(async () => ({
        result: { value: { x: 100, y: 200 } },
      })),
    },
    Input: {
      dispatchMouseEvent: mock.fn(async (_params: any) => {}),
      dispatchKeyEvent: mock.fn(async (_params: any) => {}),
    },
    Accessibility: {
      enable: mock.fn(async () => {}),
      getFullAXTree: mock.fn(async () => ({ nodes: [] })),
    },
  };
}

type MockClient = ReturnType<typeof createMockClient>;

describe("browser/actions", () => {
  let mockClient: MockClient;
  let actions: typeof import("./actions.js");

  beforeEach(async () => {
    mockClient = createMockClient();
    actions = await import("./actions.js");
  });

  // Helper to pass mock as CDP.Client
  function client(): import("chrome-remote-interface").Client {
    return mockClient as unknown as import("chrome-remote-interface").Client;
  }

  describe("navigate", () => {
    it("calls Page.navigate with the given URL", async () => {
      mockClient.Page.loadEventFired.mock.mockImplementation(async () => ({}));
      mockClient.Page.navigate.mock.mockImplementation(async () => ({
        frameId: "f1",
        loaderId: "l1",
      }));

      await actions.navigate(client(), "https://example.com");
      assert.equal(mockClient.Page.enable.mock.callCount(), 1);
      assert.equal(mockClient.Page.navigate.mock.callCount(), 1);
    });

    it("throws on navigation error", async () => {
      mockClient.Page.loadEventFired.mock.mockImplementation(async () => ({}));
      mockClient.Page.navigate.mock.mockImplementation(async () => ({
        frameId: "f1",
        loaderId: "l1",
        errorText: "net::ERR_CONNECTION_REFUSED",
      }));

      await assert.rejects(
        actions.navigate(client(), "https://broken.example"),
        (err: Error) => err.message.includes("Navigation failed"),
      );
    });
  });

  describe("click", () => {
    it("dispatches mouse events via fallback path", async () => {
      // First evaluate returns null (data-attr approach fails), fallback to resolveNode
      mockClient.Runtime.evaluate.mock.mockImplementation(async () => ({
        result: { value: null },
      }));

      await actions.click(client(), "42");

      // Should dispatch mousePressed and mouseReleased
      assert.equal(mockClient.Input.dispatchMouseEvent.mock.callCount(), 2);
      const calls = mockClient.Input.dispatchMouseEvent.mock.calls;
      const firstCallArgs = calls[0].arguments[0] as Record<string, unknown>;
      assert.equal(firstCallArgs.type, "mousePressed");
    });
  });

  describe("fill", () => {
    it("focuses the element and dispatches key events", async () => {
      await actions.fill(client(), "5", "abc");

      assert.equal(mockClient.DOM.focus.mock.callCount(), 1);
      // 3 chars * 2 events (keyDown + keyUp) = 6
      assert.equal(mockClient.Input.dispatchKeyEvent.mock.callCount(), 6);
    });

    it("handles empty text", async () => {
      await actions.fill(client(), "5", "");
      assert.equal(mockClient.Input.dispatchKeyEvent.mock.callCount(), 0);
    });
  });

  describe("screenshot", () => {
    it("returns a Buffer", async () => {
      const buf = await actions.screenshot(client());
      assert.ok(Buffer.isBuffer(buf));
    });

    it("captures in PNG format", async () => {
      await actions.screenshot(client());
      assert.equal(mockClient.Page.captureScreenshot.mock.callCount(), 1);
    });
  });

  describe("evaluate", () => {
    it("returns the evaluated value", async () => {
      mockClient.Runtime.evaluate.mock.mockImplementation(async () => ({
        result: { value: 42 },
      }));

      const result = await actions.evaluate(client(), "21 + 21");
      assert.equal(result, 42);
    });

    it("throws on evaluation error", async () => {
      mockClient.Runtime.evaluate.mock.mockImplementation(async () => ({
        result: { value: undefined },
        exceptionDetails: {
          text: "SyntaxError",
          exception: { description: "SyntaxError: unexpected token" },
        },
      }));

      await assert.rejects(
        actions.evaluate(client(), "invalid code!!!"),
        (err: Error) => err.message.includes("Evaluation error"),
      );
    });
  });

  describe("waitForSelector", () => {
    it("resolves when selector is found immediately", async () => {
      // Default mock returns nodeId: 42 (non-zero = found)
      await actions.waitForSelector(client(), ".my-class");
      assert.ok(mockClient.DOM.querySelector.mock.callCount() >= 1);
    });

    it("times out when selector is never found", async () => {
      // Return nodeId 0 = not found
      mockClient.DOM.querySelector.mock.mockImplementation(async () => ({ nodeId: 0 }));

      await assert.rejects(
        actions.waitForSelector(client(), ".never-exists", 300),
        (err: Error) => err.message.includes("timed out"),
      );
    });

    it("retries until selector appears", async () => {
      let calls = 0;
      mockClient.DOM.querySelector.mock.mockImplementation(async () => {
        calls++;
        return { nodeId: calls >= 3 ? 99 : 0 };
      });

      await actions.waitForSelector(client(), ".delayed", 5000);
      assert.ok(calls >= 3);
    });
  });
});
