/**
 * The one list of Concept_Views, shared by the image resolver, the content
 * schema, the Angle_Viewer state module and the components.
 * The eight base names are also the Concept_Image_Folder file names (Req 8B.2).
 */

export const TURN_VIEWS = [
  '01-front',
  '02-front-three-quarter',
  '03-side',
  '04-back-three-quarter',
  '05-back',
] as const;
export type TurnView = (typeof TURN_VIEWS)[number];

export const TAB_VIEWS = ['06-inside', '07-fabric-closeup', '08-on-model'] as const;
export type TabView = (typeof TAB_VIEWS)[number];

export const VIEW_BASES = [...TURN_VIEWS, ...TAB_VIEWS] as const;
export type ViewBase = (typeof VIEW_BASES)[number];

export const VIEW_NAMES: Record<ViewBase, string> = {
  '01-front': 'Front',
  '02-front-three-quarter': 'Front three-quarter',
  '03-side': 'Side',
  '04-back-three-quarter': 'Back three-quarter',
  '05-back': 'Back',
  '06-inside': 'Inside',
  '07-fabric-closeup': 'Fabric close-up',
  '08-on-model': 'On a model',
};
