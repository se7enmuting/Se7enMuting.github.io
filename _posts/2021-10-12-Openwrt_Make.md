---
layout: post
title: "🧰ImmortalWrt ⛏️云编译📿指北（2026版）"
subtitle: ""
author: "Se7enMuting"
header-img: "img/posts/211012/post-bg.png"
header-mask: 0.4
tags:
  - 技术
  - openwrt
  - 编译
  - immortalwrt
---

> 本文是 2021 年旧版教程的重写。Lean 版 OpenWrt 已停更多年，改用 [ImmortalWrt](https://github.com/immortalwrt/immortalwrt)（更活跃、包更全、开箱即用的中国用户优化）。
> 
> 核心思路不变：**本地生成 seed.config → GitHub Actions 云编译**。本地只管出配置，编译交给云。
> 
> 云编译项目：[Se7enMuting/Actions-OpenWrt](https://github.com/Se7enMuting/Actions-OpenWrt)

---

## 先说结论：还需要本地 Ubuntu 吗？

**需要。** 你必须有一个本地 Linux 环境来跑 `make menuconfig` 生成 `seed.config`。

原因：
1. GitHub Actions 的 SSH/tmate 交互式菜单配置已被 GitHub 严打，有封号风险，且经常不可用；
2. ImmortalWrt 固件选择器（firmware-selector.immortalwrt.org）不支持外部插件（OpenClash、PassWall2）；
3. 本地 `menuconfig` 是目前唯一可靠的自定义配置方式。

**但本地只需要跑到 `seed.config`，不需要完成编译。** 环境选其一即可：
- Ubuntu 虚拟机（VMware/VirtualBox，40GB+ 磁盘）
- WSL2（Windows 用户推荐，**注意：** 务必在 Linux 的原生家目录下操作，如 `~/` 或 `/home/`，切勿在 Windows 挂载盘如 `/mnt/d/` 下克隆和编译，否则会因文件系统大小写不敏感导致编译失败）
- Docker 容器

---

## 一、本地生成 seed.config

### 1.1 环境准备

安装编译依赖。推荐 Ubuntu 22.04 / 24.04 LTS。

```bash
# 方法一：一键脚本（推荐）
sudo bash -c 'bash <(curl -s https://build-scripts.immortalwrt.org/init_build_environment.sh)'

# 方法二：手动 apt 安装
sudo apt update
sudo apt install -y build-essential asciidoc binutils bzip2 gawk gettext git \
  libncurses-dev libz-dev patch python3 unzip zlib1g-dev libc6-dev-i386 \
  subversion flex uglifyjs gcc-multilib p7zip p7zip-full msmtp libssl-dev \
  texinfo libglib2.0-dev xmlto qemu-utils upx libelf-dev autoconf automake \
  libtool autopoint device-tree-compiler g++-multilib antlr3 gperf wget curl \
  swig rsync ccache
```

注意：**不要用 root 用户编译。**

### 1.2 克隆 ImmortalWrt 源码

```bash
git clone --depth 1 https://github.com/immortalwrt/immortalwrt.git
cd immortalwrt
```

- `--depth 1` 只克隆最新 commit，省时省空间
- 如需指定稳定分支：`git clone -b openwrt-25.12 --depth 1 https://github.com/immortalwrt/immortalwrt.git`
- 推荐用 `master` 分支（活跃更新，固件版本号在 `/etc/openwrt_release` 可查）

### 1.3 添加 PassWall2 和 OpenClash

#### PassWall2（通过 feeds）

编辑根目录的 `feeds.conf.default`，追加以下两行：

```
src-git passwall2 https://github.com/Openwrt-Passwall/openwrt-passwall2.git
src-git passwall_packages https://github.com/Openwrt-Passwall/openwrt-passwall-packages.git
```

> 注意：PassWall 上游已迁移到 `Openwrt-Passwall` 组织，旧地址 `xiaorouji/openwrt-passwall2` 已 404。

#### OpenClash（通过 sparse checkout 克隆到 package 目录）

```bash
mkdir -p package/luci-app-openclash
cd package/luci-app-openclash
git init
git remote add -f origin https://github.com/vernesong/OpenClash.git
git config core.sparsecheckout true
echo "luci-app-openclash" >> .git/info/sparse-checkout
git pull --depth 1 origin master
git branch --set-upstream-to=origin/master master

# 编译 po2lmo（如果已装过可跳过）
pushd luci-app-openclash/tools/po2lmo
make && sudo make install
popd

cd ../..
```

#### 可选：主题和其他插件

```bash
git clone https://github.com/jerrykuku/luci-theme-argon package/luci-theme-argon
# 关机/电源管理插件（独立插件形式，不污染系统核心代码）
git clone https://github.com/sirpdboy/luci-app-poweroffdevice package/luci-app-poweroffdevice
# 额外的自定义包（根据需要添加，例如作者本人的 Openwrt-Packages）
# git clone https://github.com/Se7enMuting/Openwrt-Packages package/Openwrt-Packages
```

> 注意：`luci-theme-argon` 的 `18.06` 分支是给 Lean LEDE 用的，ImmortalWrt 必须用默认的 `master` 分支（v2.x）。同时推荐使用独立的关机插件 `luci-app-poweroffdevice`，更符合现代 LuCI 规范。

### 1.4 更新并安装 feeds

```bash
./scripts/feeds update -a
./scripts/feeds install -a -f
```

`-f` 表示 feeds 与源码的同名 package 优先用 feeds 的版本。

### 1.5 make menuconfig 配置

```bash
make menuconfig
```

以下为推荐配置（x86 软路由 / PVE 虚拟机场景）：

| 路径 | 操作 | 说明 |
|------|------|------|
| `LuCI > Applications > luci-app-openclash` | **+**（选中） | OpenClash |
| `LuCI > Applications > luci-app-passwall2` | **+**（选中） | PassWall2 |
| `LuCI > Applications > luci-app-poweroffdevice` | **+**（选中） | 关机/电源管理插件 |
| `LuCI > Modules > luci-compat` | **+**（选中） | OpenClash 依赖 |
| `Kernel modules > Network Support > kmod-tun` | **+**（选中） | OpenClash 依赖，**最后确认一次**（可能被自动取消） |
| `Extra packages > ipv6helper` | **+**（选中） | IPv6 支持 |
| `Network > Firewall > iptables` 下的 ip6tables-extra、ip6tables-mod-nat | **+**（选中） | IPv6 依赖 |
| `Extra packages > autosamba` | **-**（取消） | 不用 samba 就去掉 |
| `LuCI > Applications > luci-app-samba` | **-**（取消） | 同上 |
| `Target Images > Kernel partition size` | 改为 `64` | 插件多时增大内核分区（默认 16MB） |
| `Target Images > Root filesystem partition size` | 改为 `512` | 插件多时增大根分区（默认 160MB） |
| `Base system > dnsmasq-full` | **+**（选中，HAVE 不选） | 完整版 dnsmasq |
| `Utilities > Virtualization > qemu-ga` | **+**（选中） | PVE 虚拟机 QEMU Guest Agent |
| `Target Images > QCOW2 IMAGES` | **+**（选中） | PVE 用 QCOW2 镜像 |
| `Network > iperf3` | **+**（选中） | netspeedtest 依赖 |
| `Network > IP Addresses and Names > ddns-scripts_*` | **+**（按需） | DDNS 插件 |

> 无需分"首次"和"第二次"编译——一次性选好所有需要的插件即可。

### 1.6 下载依赖库并导出 seed.config

```bash
make defconfig
make download -j8 V=s
./scripts/diffconfig.sh > seed.config
```

- `make defconfig`：将 menuconfig 选择的配置补全为完整 `.config`
- `make download`：下载所有源码包（为云编译预热，避免云上因网络问题下载失败）
- `./scripts/diffconfig.sh > seed.config`：导出差异配置（只有你改动过的项）

**至此本地的任务就完成了。** 不需要本地 `make`，把 `seed.config` 的内容复制出来即可。

---

## 二、云编译（GitHub Actions）

### 2.1 Fork 项目

Fork [Se7enMuting/Actions-OpenWrt](https://github.com/Se7enMuting/Actions-OpenWrt) 到你自己的 GitHub 账号。

仓库结构：
```
immortalwrt/
  .config              ← 放你的完整 .config（或 seed.config 内容）
  diy-part1.sh         ← feeds 更新前执行的脚本
  diy-part2.sh         ← feeds 更新后、编译前执行的脚本
  diy-part3.sh         ← 额外的自定义脚本（可选）
```

### 2.2 更新 .config

将上一步生成的 `seed.config` 的内容，粘贴替换 `immortalwrt/.config` 文件。

> 由于 `seed.config` 是差异配置（非完整），GitHub Actions 工作流中的 `make defconfig` 步骤会自动补全默认项。你也可以直接把本地完整 `.config` 放进去。

### 2.3 编辑 diy-part1.sh（pre-feeds 脚本）

在 feeds 更新前添加 PassWall2 源：

```bash
#!/bin/bash

# 添加 PassWall2 源
echo 'src-git passwall2 https://github.com/Openwrt-Passwall/openwrt-passwall2.git' >> feeds.conf.default
echo 'src-git passwall_packages https://github.com/Openwrt-Passwall/openwrt-passwall-packages.git' >> feeds.conf.default
```

### 2.4 编辑 diy-part2.sh（pre-compile 脚本）

在编译前克隆 OpenClash 并做一些配置修改：

```bash
#!/bin/bash

# 修改默认 LAN IP
sed -i 's/192.168.1.1/192.168.1.95/g' package/base-files/files/bin/config_generate

# 克隆 OpenClash
mkdir -p package/luci-app-openclash
cd package/luci-app-openclash
git init
git remote add -f origin https://github.com/vernesong/OpenClash.git
git config core.sparsecheckout true
echo "luci-app-openclash" >> .git/info/sparse-checkout
git pull --depth 1 origin master
git branch --set-upstream-to=origin/master master
cd ../..

# 克隆主题与关机插件（独立插件形式，不污染系统核心代码）
git clone https://github.com/jerrykuku/luci-theme-argon package/luci-theme-argon
git clone https://github.com/sirpdboy/luci-app-poweroffdevice package/luci-app-poweroffdevice
# 额外的自定义包（根据需要选择克隆）
# git clone https://github.com/Se7enMuting/Openwrt-Packages package/Openwrt-Packages

# 去除自带主题/插件（避免冲突）
rm -rf package/feeds/luci/luci-theme-argon
# rm -rf package/feeds/luci/luci-app-wrtbwmon
```

### 2.5 触发编译

进入你的仓库 → **Actions** → 选择对应的 ImmortalWrt 工作流 → **Run workflow**。

编译完成后，在 **Artifacts** 或 **Release** 中下载固件。输出文件在 `bin/targets/x86/64/` 下。

---

## 三、安装

### PVE 安装

```bash
qm importdisk 100 /var/lib/vz/template/iso/openwrt-x86-64-generic-squashfs-combined-efi.img local-lvm
```

`100` 为你的虚拟机 ID，请自行修改。

### 软件源配置（ImmortalWrt）与内核模块锁死警告

登录 Web → 系统 → 软件包 → 设置，修改为官方源（注意版本号要和你的固件一致）：

```
src/gz immortalwrt_core https://downloads.immortalwrt.org/releases/25.12.0/targets/x86/64/packages
src/gz immortalwrt_base https://downloads.immortalwrt.org/releases/25.12.0/packages/x86_64/base
src/gz immortalwrt_luci https://downloads.immortalwrt.org/releases/25.12.0/packages/x86_64/luci
src/gz immortalwrt_packages https://downloads.immortalwrt.org/releases/25.12.0/packages/x86_64/packages
src/gz immortalwrt_routing https://downloads.immortalwrt.org/releases/25.12.0/packages/x86_64/routing
src/gz immortalwrt_telephony https://downloads.immortalwrt.org/releases/25.12.0/packages/x86_64/telephony
```

自编译固件由于签名不一致，需要注释掉签名检查：

```bash
# option check_signature
```

> [!WARNING]
> **内核模块 (vermagic) 锁死警告**
> 
> 由于 OpenWrt 编译时有内核哈希一致性检查（vermagic），自编译系统的内核哈希与官方源预编译模块（`kmod-*`）通常无法完美匹配。即使关闭签名检查，后续通过 `opkg install kmod-xxx` 安装内核级别插件（如各种网卡驱动、网关加速模块等）依然会报错失败。
> 
> **因此，在本地 `menuconfig` 阶段，务必将未来可能需要的内核级别模块一次性勾选为内置（`*`），不要依赖后期在线安装。**

国内用户可把 `downloads.immortalwrt.org` 替换为镜像站地址（如腾讯云、清华源等镜像站）。

---

## 四、其他碎碎念

### seed.config 工作流总结

```
本地 Ubuntu → make menuconfig → ./scripts/diffconfig.sh > seed.config
                                                              ↓
                               seed.config → Actions-OpenWrt/immortalwrt/.config
                                                              ↓
                                            GitHub Actions → 云编译 → 下载固件
```

### 更新编译

在 Actions-OpenWrt 仓库中更新 `.config` 后重新触发工作流即可。也可以用 `diy-part3.sh` 做一些清理/重置操作。

### 单独编译 IPK 插件

1. 在 `menuconfig` 中将插件设为 `M`（编译为独立 IPK，不进固件）
2. `make package/<插件名>/compile V=99`
3. IPK 输出路径：`bin/packages/x86_64/<插件名>/`

### DDNS 域名填写方法（luci-app-ddns）

- `example.com` → 域名填 `@example.com`
- `blog.example.com` → 域名填 `blog@example.com`
- `good.blog.example.com` → 域名填 `good.blog@example.com`
