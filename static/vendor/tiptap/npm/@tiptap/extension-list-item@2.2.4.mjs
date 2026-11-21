/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@tiptap/extension-list-item@2.2.4/dist/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{Node as i,mergeAttributes as r}from"/vendor/tiptap/npm/@tiptap/core@2.2.4.mjs";const t=i.create({name:"listItem",addOptions(){return{HTMLAttributes:{},bulletListTypeName:"bulletList",orderedListTypeName:"orderedList"}},content:"paragraph block*",defining:!0,parseHTML(){return[{tag:"li"}]},renderHTML({HTMLAttributes:e}){return["li",r(this.options.HTMLAttributes,e),0]},addKeyboardShortcuts(){return{Enter:()=>this.editor.commands.splitListItem(this.name),Tab:()=>this.editor.commands.sinkListItem(this.name),"Shift-Tab":()=>this.editor.commands.liftListItem(this.name)}}});export{t as ListItem,t as default};
//# sourceMappingURL=/sm/4a8e3166b09a089c336fb2113f8006363be698dc7a67f8ce5f65512a2f5e9e29.map