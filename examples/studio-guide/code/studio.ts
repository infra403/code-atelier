/**
 * Code Atelier · 编辑器工坊
 * 原创 TypeScript 配色示例，无外部依赖。
 */

type WorkspaceMode = "writing" | "reading" | "development";

interface StudioPreset {
  name: string;
  mode: WorkspaceMode;
  palette: {
    paper: string;
    ink: string;
    accent: string;
  };
  features: readonly string[];
}

export const studio: StudioPreset = {
  name: "Code Atelier",
  mode: "development",
  palette: {
    paper: "#faf9f5",
    ink: "#30302c",
    accent: "#a14e32",
  },
  features: ["主题与排版", "阅读与标记", "图表与导航"],
};

// 用同一套暖白配色，继续编写代码。
function describeWorkspace(preset: StudioPreset): string {
  const features = preset.features.join(" · ");
  return `${preset.name} / ${preset.mode}\n${features}`;
}

console.log(describeWorkspace(studio));
