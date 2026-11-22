// The right pane of the design editor, as choices first. With an element selected: its name and summary, then only the groups that apply to
// its type (Content, Size, Position, Colour, Style), each a row of visual choices with the exact catalogue-driven values behind "Fine-tune",
// "Shown only when" as a sentence, and "More settings" for what no group claims. With nothing selected: the design itself (name, when to use it,
// page colour, fields, and under "More" the accept rules, empty space and where text stays). The parts are in design/.
export { ElementProperties, type PropertiesProps } from './design/ElementPane';
export { DesignSettings, type DesignSettingsProps } from './design/DesignPane';
