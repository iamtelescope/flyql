import { describe, it, expect } from "vitest";
import {
  Node,
  Expression,
  Key,
  FlyqlError,
  VALID_BOOL_OPERATORS,
} from "../../src/index.js";

const INVALID_OPERATOR_VALUE = "INVALID_OPERATOR";

function getValidExpression() {
  return new Expression(new Key(["a"]), "=", "b", null);
}

function getValidNode() {
  return new Node(VALID_BOOL_OPERATORS[0], getValidExpression(), null, null);
}

describe("Node", () => {
  it("should initialize with valid bool operators", () => {
    VALID_BOOL_OPERATORS.forEach((op) => {
      const node = new Node(op, getValidExpression(), null, null);
      expect(node.boolOperator).toBe(op);
      expect(node.expression).not.toBeNull();
      expect(node.left).toBeNull();
      expect(node.right).toBeNull();
    });
  });

  it("should set bool operator correctly", () => {
    const node = getValidNode();
    expect(node.boolOperator).toBe(VALID_BOOL_OPERATORS[0]);

    node.setBoolOperator(VALID_BOOL_OPERATORS[1]);
    expect(node.boolOperator).toBe(VALID_BOOL_OPERATORS[1]);
  });

  it("should throw error for invalid bool operator", () => {
    const node = getValidNode();
    expect(() => node.setBoolOperator(INVALID_OPERATOR_VALUE)).toThrow(
      FlyqlError,
    );
  });

  it("should set left child", () => {
    const node = getValidNode();
    expect(node.left).toBeNull();

    const left = getValidNode();
    node.setLeft(left);
    expect(node.left).toBe(left);
  });

  it("should set right child", () => {
    const node = getValidNode();
    expect(node.right).toBeNull();

    const right = getValidNode();
    node.setRight(right);
    expect(node.right).toBe(right);
  });

  it("should set expression", () => {
    const node = getValidNode();
    const expression = getValidExpression();
    expect(node.expression).not.toBe(expression);

    node.setExpression(expression);
    expect(node.expression).toBe(expression);
  });

  it("should create node with children and no expression", () => {
    const left = getValidNode();
    const right = getValidNode();
    const node = new Node("and", null, left, right);

    expect(node.left).toBe(left);
    expect(node.right).toBe(right);
    expect(node.expression).toBeNull();
  });

  it("should create node with expression and no children", () => {
    const expression = getValidExpression();
    const node = new Node("", expression, null, null);

    expect(node.expression).toBe(expression);
    expect(node.left).toBeNull();
    expect(node.right).toBeNull();
  });

  it("should throw error when both children and expression are provided", () => {
    const left = getValidNode();
    const right = getValidNode();
    const expression = getValidExpression();

    expect(() => new Node("and", expression, left, right)).toThrow(FlyqlError);
  });
});
