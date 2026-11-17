# TechZone UML diagrams

The [SAD](../software-architecture-design.md) embeds these rendered SVGs. The `.puml` files are the editable PlantUML sources; SVGs remain readable without a PlantUML installation.

| View | Source | Rendered diagram |
| --- | --- | --- |
| Staff use cases | [use-cases.puml](use-cases.puml) | [SVG](use-cases.svg) |
| Core domain classes | [core-classes.puml](core-classes.puml) | [SVG](core-classes.svg) |
| Transaction domain classes | [transaction-classes.puml](transaction-classes.puml) | [SVG](transaction-classes.svg) |
| Purchase receipt sequence | [receipt-sequence.puml](receipt-sequence.puml) | [SVG](receipt-sequence.svg) |
| Sale sequence | [sale-sequence.puml](sale-sequence.puml) | [SVG](sale-sequence.svg) |

The views describe implementation baseline `82ef87a`. Selected model fields and principal interaction paths are shown; the SAD links each view to its implementation. Class diagrams use association multiplicities and composition for embedded data. Use-case actor generalization shares common staff actions. Sequence diagrams use lifelines, alternatives, loops and transaction frames.

Render from the repository root with Java and PlantUML 1.2026.10:

```sh
java -Djava.awt.headless=true -jar /path/to/plantuml.jar -tsvg -failfast2 docs/specifications/uml/*.puml
```

Class/use-case sources select PlantUML's bundled Smetana layout engine; Graphviz is not required. No diagram runtime dependency is added to the application.
