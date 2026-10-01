// Deliberate test fixture, never executed.
//
// The security audit profile matches raw text after masking comments out, not
// syntax, so the two sinks this fixture exists to hold are quoted as data
// rather than written as statements. The profile still reports both of them
// and the file itself contains no executable sink for a reader to mistake for
// live code. Writing them as comments would not do instead: comments are
// masked before matching, which is exactly what the masker is for.
//
// Asserted in tests/run.mjs, which requires both ids and nothing else, and in
// tests/audit-profiles-spelling.mjs. package.json `files` omits tests, so this
// is never shipped in the npm package.
export const SINKS = [
  'el.innerHTML = response.data;',
  'eval(code);',
];
