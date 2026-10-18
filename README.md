# 说明：
### 配置修改：
/_config.yml-----------------配置文件    
/_posts/----------------------blog文章文件夹    
/img/------------------------图片文件夹    
/CNAME---------------------自定义域名    
/_includes/about/zh.md----中文about    
/_includes/about/en.md----英文about

### Google Search Console修改：
/_includes/head.html : `<meta name="google-site-verification" content="xxxxxxxxxxxx" />`

# 
### bolg站内内容交流讨论 ➡️ [Discussions](https://github.com/se7enmuting/Se7enMuting.github.io/discussions)

### 本地资源构建

需要 Node.js 20 或更新版本，以及用于 Jekyll 的 Ruby/Bundler 环境。

- `npm ci`：安装锁定的开发依赖。
- `npm run build`：从 `js/hux-blog.js` 和 `less/hux-blog.less` 生成 JavaScript、普通 CSS 和压缩 CSS，并添加项目文件头。
- `npm run watch`：首次构建后监听 JavaScript 和 Less 文件，修改后自动重建。
- `npm run start`：启动 Jekyll 本地预览。
- `npm run dev`：同时启动资源监听和 Jekyll，退出时停止两个进程。
- `npm test`：检查资源构建、压缩前后的样式和脚本行为，以及重复构建的一致性。

修改主题源文件后，运行构建并将生成的 `js/hux-blog.min.js`、`css/hux-blog.css` 和 `css/hux-blog.min.css` 一起提交。GitHub Pages 继续使用仓库内的已编译资源。
