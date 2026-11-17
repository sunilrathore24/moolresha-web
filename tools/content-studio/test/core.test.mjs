import test from 'node:test';import assert from 'node:assert/strict';import {createDraft,approve,svgSlide} from '../lib.mjs';
test('draft is isolated and starts unpublished',()=>{const d=createDraft({title:'Fabric',hook:'Know your fibres'});assert.equal(d.status,'draft');assert.equal(d.slides.length,6);});
test('approval requires caption',()=>{const d=createDraft({title:'Fabric',hook:'Know your fibres'});assert.throws(()=>approve(d),/Caption/);assert.equal(approve({...d,caption:'Useful tip'}).status,'approved');});
test('SVG escapes untrusted copy',()=>{const d=createDraft({title:'Fabric',hook:'A < B & C'});const svg=svgSlide(d,0);assert.match(svg,/&lt;/);assert.match(svg,/&amp;/);assert.doesNotMatch(svg,/A < B/);});
