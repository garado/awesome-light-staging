/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@tiptap/extension-gapcursor@2.2.4/dist/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{Extension as e,callOrReturn as l,getExtensionField as n}from"/vendor/tiptap/npm/@tiptap/core@2.2.4.mjs";import{gapCursor as s}from"/vendor/tiptap/npm/@tiptap/pm@2.2.4/gapcursor.mjs";const a=e.create({name:"gapCursor",addProseMirrorPlugins(){return[s()]},extendNodeSchema(r){var o;const t={name:r.name,options:r.options,storage:r.storage};return{allowGapCursor:(o=l(n(r,"allowGapCursor",t)))!==null&&o!==void 0?o:null}}});export{a as Gapcursor,a as default};
//# sourceMappingURL=/sm/05997b19c8538c40a90ed23cc0468f203380ced57fd8c266da73ad94e7dd6fa4.map