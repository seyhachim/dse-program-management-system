import { expect, mock, test } from "bun:test";
import type { PolicySection as PolicySectionValue } from "@dse-pms/shared-types";

type FakeElement = {
  type: unknown;
  props: Record<string, unknown>;
  key?: unknown;
};

type EffectRecord = {
  deps: readonly unknown[] | undefined;
};

let hookCursor = 0;
let stateChanged = false;
const stateSlots = new Map<number, unknown>();
const refSlots = new Map<number, { current: unknown }>();
const effectSlots = new Map<number, EffectRecord>();
let pendingEffects: Array<() => void> = [];

function useHarnessState<T>(
  initial: T | (() => T),
): [T, (next: T | ((current: T) => T)) => void] {
  const slot = hookCursor++;
  if (!stateSlots.has(slot)) {
    stateSlots.set(slot, typeof initial === "function" ? (initial as () => T)() : initial);
  }

  return [
    stateSlots.get(slot) as T,
    (next) => {
      const current = stateSlots.get(slot) as T;
      const resolved =
        typeof next === "function"
          ? (next as (current: T) => T)(current)
          : next;
      if (!Object.is(current, resolved)) {
        stateSlots.set(slot, resolved);
        stateChanged = true;
      }
    },
  ];
}

function useHarnessRef<T>(initial: T): { current: T } {
  const slot = hookCursor++;
  if (!refSlots.has(slot)) refSlots.set(slot, { current: initial });
  return refSlots.get(slot) as { current: T };
}

function useHarnessMemo<T>(factory: () => T): T {
  hookCursor++;
  return factory();
}

function sameDeps(
  previous: readonly unknown[] | undefined,
  next: readonly unknown[] | undefined,
): boolean {
  if (previous === undefined || next === undefined) return false;
  return (
    previous.length === next.length &&
    previous.every((value, index) => Object.is(value, next[index]))
  );
}

function useHarnessEffect(
  effect: () => void | (() => void),
  deps?: readonly unknown[],
): void {
  const slot = hookCursor++;
  const previous = effectSlots.get(slot);
  if (!previous || !sameDeps(previous.deps, deps)) {
    pendingEffects.push(() => {
      effect();
    });
  }
  effectSlots.set(slot, { deps });
}

function fakeJsx(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: unknown,
): FakeElement {
  return { type, props: props ?? {}, key };
}

mock.module("react", () => ({
  useEffect: useHarnessEffect,
  useMemo: useHarnessMemo,
  useRef: useHarnessRef,
  useState: useHarnessState,
}));

mock.module("react/jsx-runtime", () => ({
  Fragment: "MockFragment",
  jsx: fakeJsx,
  jsxs: fakeJsx,
}));

mock.module("react/jsx-dev-runtime", () => ({
  Fragment: "MockFragment",
  jsxDEV: fakeJsx,
}));

mock.module("@dse-pms/ui", () => ({
  Button: "MockButton",
}));

mock.module("lucide-react", () => ({
  Check: "MockCheck",
  ChevronDown: "MockChevronDown",
  ChevronRight: "MockChevronRight",
  Loader2: "MockLoader2",
  Lock: "MockLock",
  Pencil: "MockPencil",
}));

Object.assign(globalThis, {
  window: {
    setTimeout: () => 0,
  },
});

const { PolicySection } = await import("./policy-section");

const PERSISTED_POLICY: PolicySectionValue = {
  attendancePreparation: "Persisted attendance",
  academicIntegrity: "Persisted integrity",
  assignmentsLateSubmission: "Persisted assignments",
  examinationRules: "Persisted exams",
  penaltiesConsequences: "Persisted penalties",
};

function nodeText(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (!node || typeof node !== "object") return "";
  const candidate = node as Partial<FakeElement>;
  return nodeText(candidate.props?.children);
}

function findElement(
  root: unknown,
  predicate: (element: FakeElement) => boolean,
): FakeElement {
  if (Array.isArray(root)) {
    for (const child of root) {
      try {
        return findElement(child, predicate);
      } catch {
        // Continue searching siblings.
      }
    }
    throw new Error("Element not found");
  }

  if (!root || typeof root !== "object") throw new Error("Element not found");
  const element = root as FakeElement;
  if (predicate(element)) return element;

  const children = element.props?.children;
  if (children !== undefined) return findElement(children, predicate);
  throw new Error("Element not found");
}

function invoke(element: FakeElement, prop: string, ...args: unknown[]): unknown {
  const handler = element.props[prop];
  if (typeof handler !== "function") {
    throw new Error(`Expected ${prop} handler`);
  }
  return (handler as (...handlerArgs: unknown[]) => unknown)(...args);
}

function renderPolicySection(
  value: PolicySectionValue,
  onPersist: (next: PolicySectionValue) => Promise<boolean>,
): FakeElement {
  let tree: FakeElement | null = null;

  for (let pass = 0; pass < 8; pass += 1) {
    hookCursor = 0;
    stateChanged = false;
    pendingEffects = [];

    tree = PolicySection({
      value,
      onPersist,
      programPolicy: null,
      disabled: false,
    }) as unknown as FakeElement;

    const effects = pendingEffects;
    pendingEffects = [];
    for (const effect of effects) effect();

    if (!stateChanged) return tree;
  }

  throw new Error("PolicySection did not settle after effects");
}

function topCardButton(tree: FakeElement, title: string): FakeElement {
  return findElement(
    tree,
    (element) =>
      element.type === "button" && nodeText(element).includes(title),
  );
}

function actionButton(tree: FakeElement, label: string): FakeElement {
  return findElement(
    tree,
    (element) =>
      element.type === "MockButton" && nodeText(element).includes(label),
  );
}

function textarea(tree: FakeElement, fieldTitle: string): FakeElement {
  return findElement(
    tree,
    (element) =>
      element.type === "textarea" &&
      element.props["aria-label"] ===
        `${fieldTitle} course-specific instructions`,
  );
}

test("PolicySection retains card A draft after saving card B and receiving the parent value update", async () => {
  let persisted = { ...PERSISTED_POLICY };
  const persistedPayloads: PolicySectionValue[] = [];
  const onPersist = async (next: PolicySectionValue) => {
    persistedPayloads.push(next);
    persisted = next;
    return true;
  };

  let tree = renderPolicySection(persisted, onPersist);

  invoke(topCardButton(tree, "Attendance & Preparation"), "onClick");
  tree = renderPolicySection(persisted, onPersist);
  invoke(actionButton(tree, "Edit"), "onClick");
  tree = renderPolicySection(persisted, onPersist);

  invoke(textarea(tree, "Attendance & Preparation"), "onChange", {
    target: { value: "UNSAVED card A attendance draft" },
  });
  tree = renderPolicySection(persisted, onPersist);

  expect(textarea(tree, "Attendance & Preparation").props.value).toBe(
    "UNSAVED card A attendance draft",
  );

  invoke(topCardButton(tree, "Examination Rules"), "onClick");
  tree = renderPolicySection(persisted, onPersist);
  invoke(actionButton(tree, "Edit"), "onClick");
  tree = renderPolicySection(persisted, onPersist);

  invoke(textarea(tree, "Examination Rules"), "onChange", {
    target: { value: "Saved card B examination edit" },
  });
  tree = renderPolicySection(persisted, onPersist);

  await invoke(actionButton(tree, "Save changes"), "onClick");

  // Simulate the real parent rerender after successful persistence updates `value`.
  tree = renderPolicySection(persisted, onPersist);

  expect(persistedPayloads).toHaveLength(1);
  expect(persisted.attendancePreparation).toBe("Persisted attendance");
  expect(persisted.examinationRules).toBe("Saved card B examination edit");

  invoke(topCardButton(tree, "Attendance & Preparation"), "onClick");
  tree = renderPolicySection(persisted, onPersist);
  invoke(actionButton(tree, "Edit"), "onClick");
  tree = renderPolicySection(persisted, onPersist);

  expect(textarea(tree, "Attendance & Preparation").props.value).toBe(
    "UNSAVED card A attendance draft",
  );
});
