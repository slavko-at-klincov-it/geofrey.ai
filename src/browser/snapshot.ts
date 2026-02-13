import type CDP from "chrome-remote-interface";

export interface AccessibilityNode {
  nodeId: string;
  role: string;
  name: string;
  value?: string;
  children?: AccessibilityNode[];
}

export interface PageSnapshot {
  url: string;
  title: string;
  tree: AccessibilityNode[];
}

function mapAXNode(node: {
  nodeId: string;
  role?: { value?: string };
  name?: { value?: string };
  value?: { value?: string };
  children?: Array<{
    nodeId: string;
    role?: { value?: string };
    name?: { value?: string };
    value?: { value?: string };
    children?: unknown[];
  }>;
}): AccessibilityNode {
  const result: AccessibilityNode = {
    nodeId: node.nodeId,
    role: node.role?.value ?? "unknown",
    name: node.name?.value ?? "",
  };

  if (node.value?.value !== undefined) {
    result.value = node.value.value;
  }

  return result;
}

function buildTree(
  nodes: Array<{
    nodeId: string;
    role?: { value?: string };
    name?: { value?: string };
    value?: { value?: string };
    childIds?: string[];
  }>,
): AccessibilityNode[] {
  const nodeMap = new Map<string, AccessibilityNode>();
  const childIdMap = new Map<string, string[]>();

  // First pass: create all nodes
  for (const raw of nodes) {
    nodeMap.set(raw.nodeId, mapAXNode(raw));
    if (raw.childIds && raw.childIds.length > 0) {
      childIdMap.set(raw.nodeId, raw.childIds);
    }
  }

  // Second pass: attach children
  for (const [parentId, childIds] of childIdMap) {
    const parent = nodeMap.get(parentId);
    if (!parent) continue;
    const children: AccessibilityNode[] = [];
    for (const childId of childIds) {
      const child = nodeMap.get(childId);
      if (child) children.push(child);
    }
    if (children.length > 0) {
      parent.children = children;
    }
  }

  // Find root nodes (nodes that are not children of any other node)
  const allChildIds = new Set<string>();
  for (const ids of childIdMap.values()) {
    for (const id of ids) allChildIds.add(id);
  }

  const roots: AccessibilityNode[] = [];
  for (const [id, node] of nodeMap) {
    if (!allChildIds.has(id)) {
      roots.push(node);
    }
  }

  return roots.length > 0 ? roots : Array.from(nodeMap.values()).slice(0, 1);
}

export async function getAccessibilityTree(client: CDP.Client): Promise<AccessibilityNode[]> {
  await client.Accessibility.enable();
  const { nodes } = await client.Accessibility.getFullAXTree();
  return buildTree(nodes as Array<{
    nodeId: string;
    role?: { value?: string };
    name?: { value?: string };
    value?: { value?: string };
    childIds?: string[];
  }>);
}

export function findNodeByRole(tree: AccessibilityNode[], role: string, name?: string): AccessibilityNode | undefined {
  for (const node of tree) {
    if (node.role === role && (name === undefined || node.name === name)) {
      return node;
    }
    if (node.children) {
      const found = findNodeByRole(node.children, role, name);
      if (found) return found;
    }
  }
  return undefined;
}

export function findNodeByText(tree: AccessibilityNode[], text: string): AccessibilityNode | undefined {
  const lower = text.toLowerCase();
  for (const node of tree) {
    if (node.name.toLowerCase().includes(lower) || node.value?.toLowerCase().includes(lower)) {
      return node;
    }
    if (node.children) {
      const found = findNodeByText(node.children, text);
      if (found) return found;
    }
  }
  return undefined;
}

export async function getPageSnapshot(client: CDP.Client): Promise<PageSnapshot> {
  const [tree, navResult] = await Promise.all([
    getAccessibilityTree(client),
    client.Runtime.evaluate({ expression: "JSON.stringify({ url: location.href, title: document.title })" }),
  ]);

  let url = "";
  let title = "";

  try {
    const parsed = JSON.parse(navResult.result.value as string);
    url = parsed.url;
    title = parsed.title;
  } catch {
    // Fallback: try to get URL from Target info
  }

  return { url, title, tree };
}
