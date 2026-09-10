# Vendored `node-pty` linux-x64 binary

`pty.node` here is the Linux build of node-pty, used **only by the WSL launch
mode** (the server runs inside WSL, needs a Linux native module — `node-pty`
publishes no Linux prebuild, Linux users normally compile locally).

Committed so the Windows CI build (which can't compile a Linux binary) can
still ship WSL-mode support, and so the build is reproducible.

## When to refresh it

- `node-pty` version bumps in `package.json` (rare — it's N-API, ABI-stable
  across Node 18–23, so a Node bump alone never needs this).
- The target WSL distro's arch or glibc floor changes.

```
npm install                       # in WSL, rebuilds node_modules/node-pty
cp node_modules/node-pty/build/Release/pty.node \
   desktop/vendor/node-pty-linux-x64/pty.node
```

`desktop/scripts/stage.mjs` asserts this file exists and is an ELF x86-64
binary before every package build.
