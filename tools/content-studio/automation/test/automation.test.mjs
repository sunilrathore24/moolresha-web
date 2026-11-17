import test from 'node:test';import assert from 'node:assert/strict';
import {dueSlots} from '../config.mjs';import {auditDraft} from '../quality.mjs';import {publishCarousel,publishReel} from '../instagram.mjs';
test('morning slot due in IST',()=>{const due=dueSlots(new Date('2026-11-17T03:00:00Z'));assert.equal(due.length,1);assert.equal(due[0].kind,'carousel')});
test('unsafe claim is flagged',()=>{const draft={title:'Fabric',hook:'hello',caption:'100% eco-friendly',slides:Array(6).fill('hello'),sources:[]};assert.equal(auditDraft(draft).passed,false)});
test('Instagram adapter defaults to dry run',async()=>{const x=await publishCarousel({igUserId:'123',images:['https://example.org/1.jpg','https://example.org/2.jpg'],caption:'Test'});assert.equal(x.dryRun,true)});
test('Instagram reel needs media',async()=>{await assert.rejects(publishReel({igUserId:'123',caption:'Test'}),/HTTPS/)});
