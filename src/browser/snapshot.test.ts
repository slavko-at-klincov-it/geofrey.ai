import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findNodeByRole, findNodeByText } from "./snapshot.js";
import type { AccessibilityNode } from "./snapshot.js";

const sampleTree: AccessibilityNode[] = [
  {
    nodeId: "1",
    role: "WebArea",
    name: "Test Page",
    children: [
      {
        nodeId: "2",
        role: "heading",
        name: "Welcome",
      },
      {
        nodeId: "3",
        role: "button",
        name: "Submit",
        children: [
          {
            nodeId: "4",
            role: "StaticText",
            name: "Submit",
          },
        ],
      },
      {
        nodeId: "5",
        role: "textbox",
        name: "Email",
        value: "user@example.com",
      },
      {
        nodeId: "6",
        role: "link",
        name: "Learn more",
      },
      {
        nodeId: "7",
        role: "button",
        name: "Cancel",
      },
    ],
  },
];

describe("browser/snapshot", () => {
  describe("findNodeByRole", () => {
    it("finds a node by role", () => {
      const result = findNodeByRole(sampleTree, "heading");
      assert.ok(result);
      assert.equal(result.nodeId, "2");
      assert.equal(result.name, "Welcome");
    });

    it("finds a node by role and name", () => {
      const result = findNodeByRole(sampleTree, "button", "Cancel");
      assert.ok(result);
      assert.equal(result.nodeId, "7");
    });

    it("finds a nested node", () => {
      const result = findNodeByRole(sampleTree, "StaticText");
      assert.ok(result);
      assert.equal(result.nodeId, "4");
    });

    it("returns undefined when role not found", () => {
      const result = findNodeByRole(sampleTree, "checkbox");
      assert.equal(result, undefined);
    });

    it("returns undefined when role matches but name does not", () => {
      const result = findNodeByRole(sampleTree, "button", "NonExistent");
      assert.equal(result, undefined);
    });

    it("finds first match among multiple nodes with same role", () => {
      const result = findNodeByRole(sampleTree, "button");
      assert.ok(result);
      assert.equal(result.nodeId, "3");
      assert.equal(result.name, "Submit");
    });

    it("handles empty tree", () => {
      const result = findNodeByRole([], "button");
      assert.equal(result, undefined);
    });
  });

  describe("findNodeByText", () => {
    it("finds a node by exact name match", () => {
      const result = findNodeByText(sampleTree, "Welcome");
      assert.ok(result);
      assert.equal(result.nodeId, "2");
    });

    it("finds a node by partial name match (case-insensitive)", () => {
      const result = findNodeByText(sampleTree, "learn");
      assert.ok(result);
      assert.equal(result.nodeId, "6");
      assert.equal(result.name, "Learn more");
    });

    it("finds a node by value match", () => {
      const result = findNodeByText(sampleTree, "user@example");
      assert.ok(result);
      assert.equal(result.nodeId, "5");
    });

    it("finds a nested node by text", () => {
      const result = findNodeByText(sampleTree, "Submit");
      assert.ok(result);
      // Should find the first matching node (button name)
      assert.equal(result.role, "button");
    });

    it("returns undefined when text not found", () => {
      const result = findNodeByText(sampleTree, "nonexistent text");
      assert.equal(result, undefined);
    });

    it("handles empty tree", () => {
      const result = findNodeByText([], "anything");
      assert.equal(result, undefined);
    });

    it("case-insensitive search", () => {
      const result = findNodeByText(sampleTree, "WELCOME");
      assert.ok(result);
      assert.equal(result.nodeId, "2");
    });
  });

  describe("getPageSnapshot / getAccessibilityTree", () => {
    it("getPageSnapshot is exported as a function", async () => {
      const mod = await import("./snapshot.js");
      assert.equal(typeof mod.getPageSnapshot, "function");
    });

    it("getAccessibilityTree is exported as a function", async () => {
      const mod = await import("./snapshot.js");
      assert.equal(typeof mod.getAccessibilityTree, "function");
    });
  });
});
