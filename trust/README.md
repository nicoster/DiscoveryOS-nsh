# Trusted update root

`root.pub` is the public half of the root key that signs release certificates. The app verifies every
hot-update package against it (`src/update.rs`).

It is currently the **prototype test root**, generated with `nsh keygen` for the hot-update prototype.
Replace it with the real offline root's public key before any release; never commit the `.secret` file.
