# Trusted update root

`root.pub` is the public half of the offline root key. Every hot-update package must be signed by a release
key that this root certified (`src/update.rs` verifies it). The root private key is never committed or given to CI;
it stays offline on the signing machine. Release keys are certified with `nsh certify` (see docs/hot-update.md).
