# @unlock-music/crypto

用于 Unlock Music 的加解密支持库。

使用 Rust 编写，并使用 `wasm-pack` 转义到 WebAssembly 格式，用于在不同的平台（浏览器）运行。

## 使用

在项目根目录下，建立或更改 `.npmrc` 文件，确保下述行存在：

```
@unlock-music:registry=https://git.um-react.app/api/packages/um/npm/
```

使用你喜欢的包管理器安装，例如 `npm` 或 `pnpm`：

```sh
# 使用 npm
npm install @unlock-music/crypto

# 使用 pnpm
pnpm install @unlock-music/crypto
```

具体能干啥… 参考源码吧。
