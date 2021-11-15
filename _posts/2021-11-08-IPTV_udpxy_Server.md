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

### 概述
- 在 Debian 10 内建一个 udpxy 服务, 直接与电信光猫上的有 IPTV 信号的口对接, 无需拨号, 无需电信的 IPTV 盒子, 即可转发 IPTV 组播, 内网直接用 .m3u 表观看，外网通过端口转发或者 xteve + plex 转发观看, 实现在任何地方自由地看自己信号源的 IPTV
- 大致流程: PVE 安装 Debian 10, 安装 Docker, Docker Dompose, 设置网络, 全 docker 部署: udpxy(xteve, plex)

### 安装宿主机PVE
- https://www.proxmox.com/downloads, 具体略

### 安装 Debian Official Cloud Image
- https://cloud.debian.org/images/cloud/ 用 10(buster)或 11(bullseye)
- 下载 debian-1x-generic-amd64.qcow2 或者 debian-1x-genericcloud-amd64.qcow2 镜像
- 大致流程：建立 VM 机, 删除硬盘, 上传镜像到宿主机 /root/，用这条指令 `qm importdisk xxx debian-10-genericcloud-amd64.qcow2 local-lvm`  (XXX是VM的ID) 创建系统硬盘，再点编辑--添加硬盘，再点`调整磁盘大小`，增加大小(到 10 G 左右可)，然后 reboot 即可，Debian 系统内不用做任何操作, 自动扩容
- 如果用 *-genericcloud-amd64.qcow2 版镜像要添加CloudInit设备，再配置

### 安装 Docker, Docker Compose
- Docker Engine 官方教程: https://docs.docker.com/engine/install/debian/
- Docker Compose V2 官方教程: https://docs.docker.com/compose/cli-command/, 这里注意:  在Debian 10下，全用户的 cli-plugins 的路径是: `/usr/libexec/docker/cli-plugins`, 而不是这篇教程里的 `/usr/local/lib/docker/cli-plugins`, 具体可以去看 Docker Compose 的 Github

### 先配置下网络
 - 本方法的硬件连接：你的 Debian 10虚拟机至少要 2 个网口，其中一个口 (ens19) 直接接电信光猫后面的有IPTV信号的口，用于获取 IPTV 的源信号，另一个口 (eht0) 接交换机，用于转发 udpxy 的组播。
 - 上海电信播放 IPTV 只需要进到 23 开头的电信专网即可, 无需拨号, 无任何认证, 无需电信的 IPTV 盒子, 进去的方法就是网口 tag 上 VLAN 85 即可（见下图）

 ![image01](/img/posts/211108/01.jpg)

 - 在 Debian 10 内输入 `ifconfig`, 查看你的 ens19 网口 (即上图的 vmbr3 虚拟网口) 是不是拿到了 23 开头的地址 (你的这个网口名可能不叫 ens19, 可能叫 eth1)

 ![image02](/img/posts/211108/02.jpg)

 - **重要：网络设置，不然igmp的流量走不通**
    - 输入
```
sysctl -w net.ipv4.conf.ens19.force_igmp_version=2 && \
sysctl -w net.ipv4.conf.ens19.rp_filter=0 && \
sysctl -w net.ipv4.conf.all.rp_filter=0
```

    - 再输入, 保存生效
```
/sbin/sysctl -p  && \
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
安装指令: `docker compose up -d`  
注意 `eth0` 是接交换机的口，是 `ens19` 接电信光猫的口, 根据自己实际情况修改  
udpxyd 的 web 访问地址(`/status/` 要打全): http://192.168.1.172:4022/status/

### 到此就建完了
- [截至 2021/11 有效的上海电信 IPTV 内网地址点这里](https://github.com/Se7enMuting/download/tree/master/SH-IPTV)

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
    - 8000:8000
    - 9001:9000
  network_mode: bridge
```
