/** Offline synthetic fixture roots only. No real-world verification is claimed.
 * Data requests cannot change this registry. Editing this file is a trust-boundary change.
 */
export const SYNTHETIC_REGISTRY_VERSION = 'synthetic-roots/1';
const syntheticRoots = Object.freeze([
  {
    "originId": "issuer-report",
    "nodeId": "e509d945e74b545858724b4d113819697e19c59e73450eaf08df7cf89b23598b"
  },
  {
    "originId": "contract-notice",
    "nodeId": "39407de241bbbd4a0b199d506ef46b08c45de3c3933b602909ef4ca407256ab6"
  },
  {
    "originId": "synthetic-note",
    "nodeId": "ac694bf88ed61036004087e6c0fb8461c1404619fd58a0995bb17a3090a0389c"
  },
  {
    "originId": "untimed-clipping",
    "nodeId": "5d3841e15a5770db640630ad0976ba638f8243a8e0f2805f4e75ea93104e2917"
  },
  {
    "originId": "later-correction",
    "nodeId": "cdc8d42739c8ff39bc846d28e9f139538367512f84c089f1fbebe3d35f0fbaf8"
  },
  {
    "originId": "independent-audit",
    "nodeId": "729952979889efa033d0035962cdade039f692d26548ec5b9529e75a97375155"
  }
].map(Object.freeze));
export function syntheticProvenanceRegistry() {
  return {version:SYNTHETIC_REGISTRY_VERSION,kind:'synthetic_fixture_registration',roots:structuredClone(syntheticRoots)};
}
