import { expect, test } from 'bun:test';
import { verifyDeclaredCapacity, validateCapacityProfile } from '@/services/publication-verification.rules';
test('VERIFY-01: igualdad y fracciones se comparan exactamente', () => {
 expect(verifyDeclaredCapacity('10.25',8,[{hour:8,maxQuantityKwh:'10.25'}]).status).toBe('APPROVED');
 expect(verifyDeclaredCapacity('10.26',8,[{hour:8,maxQuantityKwh:'10.25'}]).status).toBe('REJECTED');
 expect(verifyDeclaredCapacity('0.01',8,[{hour:8,maxQuantityKwh:'0'}]).status).toBe('REJECTED');
});
test('VERIFY-02: no inventa capacidad para perfiles ausentes, horas sin límite o históricos', () => {
 expect(verifyDeclaredCapacity('10',8,null).status).toBe('NO_REFERENCE');
 expect(verifyDeclaredCapacity('10',9,[{hour:8,maxQuantityKwh:'10'}]).status).toBe('NO_REFERENCE');
 expect(verifyDeclaredCapacity('10',null,[{hour:8,maxQuantityKwh:'10'}]).status).toBe('NO_REFERENCE');
});
test('VERIFY-03: límites declarados cero y decimales preservan origen simulado y versión', () => {
 expect(validateCapacityProfile({kind:'offer',limits:[{hour:0,maxQuantityKwh:'0'},{hour:23,maxQuantityKwh:'10.25'}]}).limits).toHaveLength(2);
 expect(verifyDeclaredCapacity('1',23,[{hour:23,maxQuantityKwh:'10.25'}])).toMatchObject({ruleId:'declared-hourly-capacity',ruleVersion:'1.0.0',source:'USER_DECLARED_SIMULATION'});
});
test.each([
 {kind:'offer',limits:[]}, {kind:'x',limits:[{hour:8,maxQuantityKwh:'10'}]},
 {kind:'offer',limits:[{hour:24,maxQuantityKwh:'10'}]}, {kind:'offer',limits:[{hour:8,maxQuantityKwh:'-1'}]},
 {kind:'offer',limits:[{hour:8,maxQuantityKwh:'10.001'}]}, {kind:'offer',limits:[{hour:8,maxQuantityKwh:10}]},
 {kind:'offer',limits:[{hour:8,maxQuantityKwh:'10'},{hour:8,maxQuantityKwh:'20'}]},
 {kind:'offer',limits:[{hour:8,maxQuantityKwh:'10'}],userId:'intruder'}
])('VERIFY-04: rechaza perfiles ambiguos o ajenos', value => { expect(() => validateCapacityProfile(value)).toThrow(); });
