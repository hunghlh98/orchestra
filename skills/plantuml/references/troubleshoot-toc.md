# PlantUML Troubleshooting Guide - Table of Contents

Comprehensive troubleshooting resources for common PlantUML errors, organized by category.

## Quick Navigation

### Setup & Environment
- [Installation & Setup Guide](troubleshoot-installation.md) - Java, Graphviz, plantuml.jar configuration

### Syntax & Fundamentals
- [General Syntax Guide](troubleshoot-general-syntax.md) - Delimiters, comments, basic structure
- [Arrows & Relationships Guide](troubleshoot-arrows.md) - Arrow syntax, connectors, relationship types
- [Text & Labels Guide](troubleshoot-text-labels.md) - Quotes, special characters, text formatting

### Styling & Appearance
- [Styling & Themes Guide](troubleshoot-styling.md) - skinparam, style blocks, colors, fonts

### Advanced Features
- [Preprocessor & Includes Guide](troubleshoot-preprocessor.md) - !include, !define, !procedure, file paths

### Diagram-Specific Guides
- [Sequence Diagrams Guide](troubleshoot-sequence.md) - Participants, arrows, activations, fragments
- [Class Diagrams Guide](troubleshoot-class.md) - Classes, relationships, visibility, generics
- [ER Diagrams Guide](troubleshoot-er.md) - Entities, relationships, cardinality
- [Activity Diagrams Guide](troubleshoot-activity.md) - Flow control, partitions, forks, loops

### Output & Performance
- [Image Generation Guide](troubleshoot-image-generation.md) - Rendering issues, output formats
- [Performance Guide](troubleshoot-performance.md) - Timeouts, memory issues, large diagrams

## Error Decision Tree

**Start Here: What type of problem are you experiencing?**

### 1. PlantUML Won't Run At All
- "Cannot find java!" → [Installation & Setup Guide](troubleshoot-installation.md) #1
- "Unable to access jarfile" → [Installation & Setup Guide](troubleshoot-installation.md) #4
- "HeadlessException" → [Installation & Setup Guide](troubleshoot-installation.md) #6

### 2. Syntax Errors
- "Some diagram description contains errors" → Check diagram-specific guide
- Missing delimiters (@startuml/@enduml) → [General Syntax Guide](troubleshoot-general-syntax.md) #1
- Arrow syntax errors → [Arrows & Relationships Guide](troubleshoot-arrows.md)
- Text/label errors → [Text & Labels Guide](troubleshoot-text-labels.md)

### 3. Diagram Type Specific Issues

**Sequence Diagrams:**
- Participant errors → [Sequence Diagrams Guide](troubleshoot-sequence.md) #1-3
- Arrow/message problems → [Sequence Diagrams Guide](troubleshoot-sequence.md) #4-7
- Fragment errors (alt/loop/opt) → [Sequence Diagrams Guide](troubleshoot-sequence.md) #10-12

**Class Diagrams:**
- Relationship syntax → [Class Diagrams Guide](troubleshoot-class.md) #1-5
- Visibility modifiers → [Class Diagrams Guide](troubleshoot-class.md) #6-8
- Generics/interfaces → [Class Diagrams Guide](troubleshoot-class.md) #9-12

**ER Diagrams:**
- Entity syntax → [ER Diagrams Guide](troubleshoot-er.md) #1-3
- Cardinality notation → [ER Diagrams Guide](troubleshoot-er.md) #6-9

**Activity Diagrams:**
- Flow control (if/while) → [Activity Diagrams Guide](troubleshoot-activity.md) #5-9
- Fork/join errors → [Activity Diagrams Guide](troubleshoot-activity.md) #10-12
- Partition syntax → [Activity Diagrams Guide](troubleshoot-activity.md) #13-14

### 4. Styling Problems
- Colors not working → [Styling & Themes Guide](troubleshoot-styling.md) #4-6
- skinparam vs style conflicts → [Styling & Themes Guide](troubleshoot-styling.md) #1-3
- Font issues → [Styling & Themes Guide](troubleshoot-styling.md) #7-10

### 5. Include & Preprocessor Errors
- "Cannot include file" → [Preprocessor & Includes Guide](troubleshoot-preprocessor.md) #1-4
- Circular dependencies → [Preprocessor & Includes Guide](troubleshoot-preprocessor.md) #8
- URL include failures → [Preprocessor & Includes Guide](troubleshoot-preprocessor.md) #11-13

### 6. Rendering & Output Issues
- "No Dot executable found" → [Installation & Setup Guide](troubleshoot-installation.md) #2
- Image generation failed → [Image Generation Guide](troubleshoot-image-generation.md) #1-5
- Wrong output format → [Image Generation Guide](troubleshoot-image-generation.md) #8-10

### 7. Performance Problems
- Diagram too slow → [Performance Guide](troubleshoot-performance.md) #1-5
- Memory errors → [Performance Guide](troubleshoot-performance.md) #6-8
- Timeout errors → [Performance Guide](troubleshoot-performance.md) #9-11

## Common Error Messages Quick Reference

| Error Message | Most Likely Cause | Guide Reference |
|---------------|-------------------|-----------------|
| "Cannot find java!" | Java not in PATH | [Installation](troubleshoot-installation.md) #1 |
| "No Dot executable found" | Graphviz missing | [Installation](troubleshoot-installation.md) #2 |
| "Some diagram description contains errors" | Syntax error (various) | Check diagram-specific guide |
| "Cannot include file" | Wrong file path | [Preprocessor](troubleshoot-preprocessor.md) #1 |
| "Syntax Error" (with line number) | Check line syntax | [General Syntax](troubleshoot-general-syntax.md) |
| "Duplicate participant" | Participant defined twice | [Sequence](troubleshoot-sequence.md) #3 |
| "Empty alt group" | Fragment missing content | [Sequence](troubleshoot-sequence.md) #11 |
| "Unable to access jarfile" | Wrong plantuml.jar path | [Installation](troubleshoot-installation.md) #4 |
| "HeadlessException" | Missing headless flag (Unix) | [Installation](troubleshoot-installation.md) #6 |
| "For some reason, dot/GraphViz has crashed" | Graphviz corrupted/version | [Installation](troubleshoot-installation.md) #3 |
| "File already included" | !include_once violation | [Preprocessor](troubleshoot-preprocessor.md) #5 |
| "Failed to generate image" | Rendering failure | [Image Generation](troubleshoot-image-generation.md) #1 |
| "NullPointerException" | Internal PlantUML error | [General Syntax](troubleshoot-general-syntax.md) #15 |
| Stack overflow | Circular includes | [Preprocessor](troubleshoot-preprocessor.md) #8 |

## Troubleshooting Workflow

### Step 1: Verify Environment
1. Check Java installation: `java -version`
2. Check Graphviz: `dot -V`
3. Check PlantUML: `java -jar plantuml.jar -version`

### Step 2: Isolate the Problem
1. Create minimal test case
2. Run with `-verbose` flag: `java -jar plantuml.jar -verbose test.puml`
3. Check PlantUML version compatibility

### Step 3: Use Specific Guides
1. Identify error category from decision tree above
2. Consult relevant guide
3. Apply solutions from most common to least common

### Step 4: Test Solutions
1. Test each solution individually
2. Verify with minimal example first
3. Apply to full diagram

## Additional Resources

- [PlantUML Official FAQ](https://plantuml.com/faq)
- [PlantUML Forum](https://forum.plantuml.net/)
- [Stack Overflow PlantUML Tag](https://stackoverflow.com/questions/tagged/plantuml)
- [PlantUML GitHub Issues](https://github.com/plantuml/plantuml/issues)

## Guide Structure

Each guide follows this format:
- **Error Message/Symptom**: What you see
- **Cause**: Why it happens
- **Solution**: How to fix it
- **Before/After Examples**: Code showing incorrect and correct versions

## Contributing

Found a common error not covered here? Please contribute by:
1. Documenting the error message
2. Providing a minimal reproduction case
3. Including the solution that worked
4. Adding before/after code examples
