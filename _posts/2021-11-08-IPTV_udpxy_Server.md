---
layout: post
title: "📺在 Debian 内建一个 udpxy 转发服务，实现自由看(上海电信) IPTV"
subtitle: ""
author: "Se7enMuting"
header-img: "img/posts/211108/post-bg.png"
header-mask: 0.4
tags:
  - 技术
  - IPTV
  - docker
  - debian
---
### 我自己家里的网络图

 ![image03](/img/posts/211108/03.png)

### 开头特别说明
- 本文不是 step by step 小白教程, **仅提供大致配置流程和核心配置参数**, 需要对如下内容有一定的基础: Linux, 虚拟机, Docker, 基础问题请不要留言提问, 自行搜索。
- 本方法目前适用于上海电信的 IPTV（截至发文时2021-11），其他地区仅供参考。
- 本人上海电信的 SDN网关/非SDN 网关都有在用，都是桥接后用 Openwrt 拨号，都可以成功转发，不管电信有没有给你开通 IPTV，即使没开通也是可以的，因为光纤里都是有 IPTV组播信号的，关键是光猫中要有 Vlan85 的设置和 Lan口的绑定，简单测试方法就是确认光猫上有网口直接插到电信 IPTV盒子上是否可播放IPTV，或者按照下文中的方法成功拿到23开头的IP地址，如果 VLAN 85 的23开头的地址拿不到，说明光猫里没有 Vlan85 的设置和绑定，可以自己进光猫设置（具体网上自己搜），如果是 SDN网关，那无法自己设置的，只能自己换有设置界面并兼容上海电信的光猫来解决。
- 关于单线复用（我用过，会不稳定），在路由系统（OP/爱快）内实现 udpxy 转发IPTV不在本文的讨论范围内，这类教程恩山上已经很多了，可自行搜索，也请不要在这里发相关留言。**本文的目的是面向那些不喜欢在路由系统内搞多余东西(特别是Docker)，追求纯净路由系统（或者ROS党），并家中有（可）自建Liunx服务器（虚拟机）的玩家。路由系统就干好网络路由的活吧，其他服务交给专业系统(Liunx)来处理。**而且本方法你折腾路由也不影响家人看电视。
- 2025我家全改用联通了，本方法目前同样适用于上海联通的 IPTV（截至最后修改2026-06），上海联通 IPTV 光猫配置：VLAN ID：44，组播 VLAN：40，VLAN 不用绑定。另 PVE 网口不用打 tag。

### 概述
- 在 Debian 12 内建一个 udpxy 服务, 直接与电信光猫上的 IPTV 信号口对接, 无需拨号, 无需电信的 IPTV 盒子, 即可转发 IPTV 组播, 内网直接用 .m3u 表观看，外网通过端口转发或者 xteve + plex 转发观看, 实现在任何地方自由地看自己信号源的 IPTV
- 大致流程: PVE 安装 Debian 12, 安装 Docker, Docker Compose, 设置网络, 全 docker 部署: udpxy(xteve, plex)

> udpxy ('you-dee-pixie') is a data stream relay: it reads data streams from a multicast groups and forwards the data to the requesting clients (subscribers).  
> udpxy是一个将UDP组播数据流变成TCP协议单播流的流量中继，它将UDP流量从给定的多播转发到请求的HTTP客户端（订阅者）。

### 安装宿主机PVE
- https://www.proxmox.com/downloads, 具体略

### 安装 Debian Official Cloud Image
- https://cloud.debian.org/images/cloud/ 用 12(bookworm)或 13(trixie)
- 下载 debian-12-generic-amd64.qcow2 或者 debian-12-genericcloud-amd64.qcow2 镜像，使用 Debian 13 时将文件名中的 12 替换为 13
- 大致流程：建立 VM 机, 删除硬盘, 上传镜像到宿主机 /root/，用这条指令 `qm importdisk xxx debian-12-genericcloud-amd64.qcow2 local-lvm`  (XXX是VM的ID) 创建系统硬盘，再点编辑--添加硬盘，再点`调整磁盘大小`，增加大小(到 10 G 左右可)，然后 reboot 即可，Debian 系统内不用做任何操作, 自动扩容
- 如果用 *-genericcloud-amd64.qcow2 版镜像要添加CloudInit设备，再配置

### 安装 Docker
官方一键安装脚本：
```
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

### 配置网络
 - 本方法的硬件连接：你的 Debian 12虚拟机至少要 2 个网口，其中一个口 (ens19) 直接接电信光猫后面的有IPTV信号的口，用于获取 IPTV 的源信号，另一个口 (eht0) 接交换机，用于转发 udpxy 的组播。_（注: 我这里Debian 12 内网口的名字叫 ens19，eht0，你的可能不是这个名字，请自行对应）_
 - 上海电信播放 IPTV 只需要进到 23 开头的电信专网即可, 无需拨号, 无任何认证, 无需电信的 IPTV 盒子, 进去的方法就是网口 tag 上 VLAN 85 即可，见下图：VLAN标签里填 85 即可。

 ![image01](/img/posts/211108/01.jpg)

 - 在 Debian 12 内输入 `ifconfig`, 查看你的 ens19 网口 (即上图的 vmbr3 虚拟网口) 是不是拿到了 23 开头的地址。如果拿不到23开头的地址，就说明你光猫里没有 Vlan85 的设置和 Lan口的绑定，需要自己设置，具体自行搜索。_（注: ifconfig 指令工具安装 `apt install net-tools -y`）_

 ![image02](/img/posts/211108/02.jpg)

 - **（重要）Debian 12 网络设置，不然igmp的流量走不通**
    - 输入(注意：指令中的 ens19 请自行替换你的IPTV网口名)
```
sysctl -w net.ipv4.conf.ens19.force_igmp_version=2
sysctl -w net.ipv4.conf.ens19.rp_filter=0
sysctl -w net.ipv4.conf.all.rp_filter=0
```

    - 再输入, 保存生效
```
/sbin/sysctl -p
/sbin/sysctl -w net.ipv4.route.flush=1
```

    - 删除还原方法
```
sysctl -w net.ipv4.conf.ens19.force_igmp_version=0
sysctl -w net.ipv4.conf.ens19.rp_filter=1
sysctl -w net.ipv4.conf.all.rp_filter=1
/sbin/sysctl -p
/sbin/sysctl -w net.ipv4.route.flush=1
```

### Docker Compose 安装 udpxy
docker-compose.yml 配置：
```
version: "3"
services:
  udpxy:
    container_name: udpxy
    image: agrrh/udpxy:latest
    network_mode: host
    restart: always
    command: -T -a eth0 -p 4022 -m ens19
```
docker compose 安装指令: `docker compose up -d`

注意 `eth0` 是接交换机的口，是 `ens19` 接电信光猫IPTV的口, 请根据自己实际情况修改

udpxyd 的 web 访问地址(`/status/` 要打全，`172`是你 Debian 12 `eth0` 口的 IP 地址): `http://192.168.1.172:4022/status/`

### 到此就建完了
访问地址格式：`http://192.168.1.172:4022/udp/239.45.3.146:5140`，直接复制进PotPlayer就能看。

有热心网友反馈要注意打开debian防火墙的相应端口。嫌麻烦的可以直接删除iptables: `apt-get purge iptables` 。

- [截至 2026 有效的上海联通 IPTV 内网地址点这里(电信是之前旧的，仅供参考)](https://github.com/Se7enMuting/download/tree/master/SH-IPTV)

## 附录：

### 另附上 xteve 和 plex 的 docker-compose.yml
xteve (国内大佬自建的XMLTV服务器: http://epg.51zmt.top:8000/e.xml)
```
version: "3"
services:
  xteve:
    container_name: xteve
    environment:
      - TZ=Asia/Shanghai
    image: alturismo/xteve:latest
    logging:
      driver: json-file
      options:
        max-file: 3
        max-size: 10m
    network_mode: host
    restart: always
    volumes:
      - ./xteve/_config:/config:rw
      - ./tmp/xteve/:/tmp/xteve:rw
      - ./tvheadend/data/:/TVH
      - ./xteve/:/root/.xteve:rw
```
plex (PLEX_CLAIM要自己获取)
```
version: "3"
services:
  plex:
    container_name: plex
    environment:
      - PLEX_CLAIM=claim-xxxxxxxxxxxxxxxxxx
      - TZ=Asia/Shanghai
    image: plexinc/pms-docker:latest
    network_mode: host
    restart: always
    volumes:
      - ./config:/config
      - ./data:/data
      - ./transcode:/transcode
```
如何通过xteve + plex转发IPTV，实现多终端+外网观看，请自行搜索，网上教程很多

### 另再附上 portainer 的 docker-compose.yml
```
version: "3"
services:
 portainer:
  image: portainer/portainer-ce:latest
  container_name: portainer
  restart: always
  volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/data
  ports:
    - 9000:9000
  network_mode: bridge
```
