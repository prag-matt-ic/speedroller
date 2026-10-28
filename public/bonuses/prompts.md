# Prompt 1: Review and refactor Typescript code for clean code principles

## Task

Use the following Clean Code Checklist to review and refactor the current file's code.

Begin first by identifying any violations of the checklist items. Then, refactor the code to address these issues.

## Checklist

- [ ] Use meaningful names – variable and function names should clearly communicate what the code does. Avoid abbreviations or cryptic identifiers; clear naming makes the code self‑documenting. Boolean variables should be named to imply true/false (e.g. isVisible, hasItems). Don't add unecessary prefixes or suffixes - e.g do not add 'Ref' to a useRef variable.

- [ ] Be consistent – use the same vocabulary for the same type of entity (e.g. always call the current player position playerPos instead of mixing currentPos, position, and pos).

- [ ] Write small, pure functions – each function should have a single responsibility. Break complex logic into smaller helpers rather than nesting conditionals.

- [ ] If a function has 3 or more parameters, use an object to group them - this makes it easier to understand what each parameter means.

- [ ] Prefer early returns over deep nesting – return early to avoid if/else pyramids.

- [ ] Prefer immutability – never mutate objects or arrays directly. When updating state, return new objects instead of modifying existing ones.

- [ ] Avoid magic numbers and strings – declare constants (e.g. LANE_COUNT = 3) so that values are descriptive and changeable. The exception to this rule is animation timing values (e.g. duration: 0.5, delay: 0.2) which can be left as literals.

- [ ] Comment judiciously – write code that is self‑explanatory. When comments are needed, make them precise and consider using // TODO to mark work that should be improved later.

- [ ] Avoid creating expensive objects/classes in loops or animation frames - reuse objects where sensible to reduce garbage collection. For example: never create a new Vector3() inside useFrame().

- [ ] Review imports and ensure that types/interfaces are imported as types (e.g import { type MyType } from '...' ). Classes should not be marked as types. Remove any unused imports.

- [ ] React function components should be declared as type FC from 'react'.

- [ ] In React 19+ ref can be passed as a prop. So remove forwardRef and define the ref as a normal prop. e.g:

```tsx
type Props = {
  ref?: React.RefObject<HTMLElement | null>;
}

- [ ] Prefer 'type' over 'interface' for defining object shapes (and props) unless you need declaration merging.

- [ ] For event handlers, use the onSubjectAction naming convention (e.g. 'onGameOverClick' or 'onEnquiryFormSubmit') rather than handleSubjectAction.
```

---

# Prompt 2: Review and refactor GLSL shaders for performance, clarity, and portability

## Goal

Review and refactor the provided **vertex** and **fragment** shaders to reduce GPU cost and improve readability **without visible regressions**.

**Success criteria**

- Visual output is indistinguishable under normal viewing (treat small numeric drift as acceptable).
- No feature regressions; interfaces (uniforms/attributes) remain compatible unless explicitly justified.
- Fewer or cheaper instructions on the bottleneck stage and no added texture fetches unless justified.

## Inputs

- Current vertex + fragment shader sources.
- (Optional) Active light count, material flags, pipeline notes.

## Procedure (follow in order)

1. **Determine bottleneck**
   - State whether the pass is vertex-bound, fragment-bound, or bandwidth-bound and why (e.g., full-screen pass → likely fragment-bound; heavy skinning/instancing → vertex-bound).
   - If uncertain, assume fragment-bound for full-screen/high overdraw, otherwise vertex-bound.

2. **Static audit (find issues)**
   - Unused or redundant: attributes, varyings, uniforms, macros.
   - Precision: missing or too-high qualifiers; mismatched varying precisions.
   - Hot ops in fragment: trig (`sin/cos`), `pow`, `exp`, divisions, conditionals/loops, multiple texture fetches.
   - Light loops: iterating beyond active lights; per-fragment work that could be per-vertex.
   - Recomputation: repeated expressions, invariant terms.
   - Interface bloat: varyings produced but not consumed.

3. **Plan (write before changing code)**
   - List concrete edits you will make, ordered by expected impact (largest → smallest), tied to the identified bottleneck.
   - Note any quality trade-offs and why they are acceptable.

4. **Refactor (apply changes)**
   - **Move work out of fragment when acceptable:** compute per-vertex values that interpolate well (e.g., sin(time), simple factors) and pass via varyings.
   - **Precision policy (apply consistently):**
     - Vertex: `highp` for matrices/positions; `mediump` for normals/dirs; colors as `lowp`.
     - Fragment: declare default precision at top; use `lowp` for colors/intensities in [0..1], `mediump` for texcoords/general math; `highp` only when depth/3D accuracy truly requires it.
     - Ensure varying precisions **match** between stages.
   - **Reduce branching:** replace `if`/`?:` with `mix/step/smoothstep` where safe; use masks instead of branches for toggles.
   - **Hoist & reuse:** common subexpressions, invariant terms (per draw/per vertex), precompute reciprocals for divides.
   - **Light handling:** use a uniform **activeLightCount**; cap loops; prefer simpler models if acceptable; consider per-vertex lighting for broad, soft lighting.
   - **Texture discipline:** avoid redundant fetches; sample once and reuse; keep coordinate math cheap (`mediump`).
   - **Keep interface lean:** only emit varyings actually used by fragment.

5. **Output (deliverables)**
   - **Findings table**
     | Issue | Location | Severity | Fix summary |
     |---|---|---|---|
   - **Refactor plan** (bulleted, 5–10 lines).
   - **Refactored code**: updated **vertex** and **fragment** shaders.
   - **Change diff**: minimal unified diff or `changes` tool entries.
   - **Impact estimate**: which stage got cheaper and why (e.g., removed N trig ops per fragment).
   - **TODOs**: further safe optimizations or optional quality dials.

## Checks (single consolidated checklist)

- **Bottleneck-aligned:** Optimization focuses on the limiting stage (vertex vs fragment).
- **Precision right-sized:** Default precision declared in fragment; qualifiers minimized; varying precisions match.
- **Uniform precision aligned:** Vertex/fragment uniform precision qualifiers remain consistent across stages.
- **Branching minimized:** Replaced with branchless math where visually safe.
- **Work moved up:** Expensive fragment computations shifted to vertex if they interpolate acceptably.
- **Redundancy removed:** Reused intermediates; hoisted invariants; reduced divides via reciprocals.
- **Light loops bounded:** Iterate up to `activeLightCount`; avoid unused lights; consider per-vertex lighting when acceptable.
- **Texture fetches minimized:** No duplicate samples; coordinate math at `mediump`.
- **Interface trimmed:** No unused varyings/inputs.
- **Readability maintained:** Small helper functions allowed (compilers inline); clear naming.
- **Portability minded:** Avoids extensions/special cases unless justified; respects GLES precision model.

## Notes & guardrails

- Do **not** change color spaces, tonemapping, or gamma unless explicitly requested.
- Preserve semantic behavior; call out any intentional approximations.
- If `highp` is not available in fragment on target, fall back to `mediump` and document.
