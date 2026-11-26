# 第三方组件与许可

Momo 自身代码以 MIT 许可发布。分发包中包含以下第三方组件：

## mihomo

- 组件：Mihomo Meta `alpha-smart-1348c4d`（vernesong/mihomo smart 分支）
- 用途：代理内核
- 许可：GPL-3.0
- 源码：https://github.com/vernesong/mihomo
- 说明：FPK 中 `app/core/mihomo` 为该构建的静态编译二进制。根据 GPL-3.0，分发二进制时应同时提供对应源码的获取方式。该构建为预发布版本，升级前请先测试配置兼容性。
- 附加数据：`app/core/Model.bin` 来自 vernesong/mihomo 的 `LightGBM-Model` release，用于 smart 组路由；`app/core/ASN.mmdb` 来自 MetaCubeX/meta-rules-dat 的 `GeoLite2-ASN.mmdb`，用于 ASN 规则。

## GeoSite / GeoIP 数据

- 组件：MetaCubeX/meta-rules-dat（`geoip.metadb`、`geosite.dat`）
- 用途：GEOSITE / GEOIP 规则匹配
- 项目：https://github.com/MetaCubeX/meta-rules-dat
- 许可与数据来源以该仓库声明为准。

## zashboard

- 项目：https://github.com/Zephyruso/zashboard
- 许可：MIT
- 说明：Momo 的代理面板在信息架构、策略组卡片与流量展示方式上参考了 zashboard，未直接复制其源码。

## @trimjs/web-app

- 项目：`@trimjs/web-app` `0.6.0`
- 用途：飞牛 fnOS 宿主主题、标题等 Web App SDK
- 许可：以 npm 包内声明为准。

## 飞牛 fnOS 开发文档

- 文档：https://developer.fnnas.com/
- 说明：应用的 manifest、生命周期、统一网关和桌面入口遵循飞牛 Native 应用规范。
