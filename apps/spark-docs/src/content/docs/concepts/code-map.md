---
title: Interactive code map
description: Explore Spark modules and follow workflows to their source evidence.
---

[Open the interactive code map](/codemap/codemap.html) to explore the source behind
Spark. Select a module to see its responsibility, related modules, source files,
and representative tests. Search by module name or file path, or follow one of
the five ordered workflows.

The runtime lens describes data and control flow; the build lens shows package
dependencies. These are different relationships. A listed test is a source
declaration, not a claim that the test passed or a provider is available.

Use **查看所选模块详情** (view selected module details) to jump to the selected module. Workflow and
relationship links clear the search filter and move keyboard focus to the detail
panel. The map supports keyboard navigation and narrow screens.

Source links open the Git revision used to build the documentation. The map is
generated with the documentation and can also be opened from
`apps/spark-docs/public/codemap/codemap.html` in a source checkout after building.
See the repository's
[map maintenance guide](https://github.com/zendev-lab/ulota/tree/main/docs/codemap)
for its source and regeneration instructions.
