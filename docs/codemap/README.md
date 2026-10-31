# Ulota 代码地图

地图用职责节点解释 `architecture/packages.json` 中的包，展示模块关系、源码文件和代表性测试声明。包清单和规范契约仍是权威来源。

## 来源与构建

`map.json` 仅维护人工整理的描述、运行时关系、工作流步骤和包分组；`template.html` 是界面源码。`scripts/codemap.py` 从跟踪文件、包清单和依赖声明生成文件索引、测试声明与构建关系，并检查包分组完整性和引用路径。

文档的开发与构建命令自动生成 `apps/spark-docs/public/codemap/` 下的 HTML 和 JSON。生成目录已忽略，不提交网页副本、文件索引或全仓库哈希清单。

```sh
python3 scripts/codemap.py check
python3 scripts/codemap.py build
```

生成的 `apps/spark-docs/public/codemap/codemap.html` 可以直接在浏览器中打开，也由文档站点托管。网页内嵌数据，浏览无需联网；GitHub 源码链接使用构建时的 Git 提交，工作区未提交变化不会自动进入该提交。文件方式打开时可通过本地链接阅读工作副本。

## 维护与验证

包归属变化时更新 `map.json`；源码行为变化时复核运行时描述。构建关系只表示生产包依赖，测试列表只表示声明，不代表执行结果或完整调用图。

在桌面和窄屏视口检查模块选择、关系视图、工作流、文件搜索、空结果恢复、键盘导航和源码链接。浏览器截图与运行结果保存在本地报告或 CI 产物中。
