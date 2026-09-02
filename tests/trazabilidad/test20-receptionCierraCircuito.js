/**
 * Test 20: Recepción cierra el circuito de trazabilidad
 * hospital-receptor + coordinador-nacional sellan la llegada.
 * Después no se puede recibir de nuevo el mismo órgano.
 */

const { createAuthenticatedClient } = require('../helpers/http');
const crypto = require('crypto');

async function run() {
  const name = 'test20_receptionCierraCircuito';

  try {
    const coord = createAuthenticatedClient('coordinador-nacional');
    const donante = createAuthenticatedClient('hospital-donante');
    const receptor = createAuthenticatedClient('hospital-receptor');

    const donorId = 'donor-rx-' + crypto.randomBytes(4).toString('hex');
    const patientId = 'patient-rx-' + crypto.randomBytes(4).toString('hex');

    const receptionPayload = {
      donorId,
      organId: donorId,
      recipientId: patientId,
      hospital: 'hospital-receptor',
    };

    const premature = await receptor.post('/tx/reception', {
      payload: receptionPayload,
      signatures: [
        {
          actor: 'hospital-receptor',
          signature: (await receptor.post('/sign', { payload: receptionPayload })).data.signature,
        },
        {
          actor: 'coordinador-nacional',
          signature: (await coord.post('/sign', { payload: receptionPayload })).data.signature,
        },
      ],
    });
    if (premature.data?.ok) {
      return { name, passed: false, detail: 'Recepción sin assignment fue aceptada' };
    }

    const donorPayload = {
      donorId,
      bloodType: 'O+',
      hlaProfile: { A: 'A2', B: 'B7', DR: 'DR5' },
      organType: 'kidney',
      preservationMethod: 'static-cold',
    };
    const donorSig = (await donante.post('/sign', { payload: donorPayload })).data.signature;
    const donorTx = await donante.post('/tx/donor-registry', {
      payload: donorPayload,
      signatures: [{ actor: 'hospital-donante', signature: donorSig }],
    });
    if (!donorTx.data?.ok) {
      return { name, passed: false, detail: `Donor: ${donorTx.data?.reason}` };
    }

    const patientPayload = {
      patientId,
      bloodType: 'O+',
      hlaProfile: { A: 'A2', B: 'B7', DR: 'DR4' },
      urgencyLevel: 3,
    };
    const wlCoord = (await coord.post('/sign', { payload: patientPayload })).data.signature;
    const wlHosp = (await donante.post('/sign', { payload: patientPayload })).data.signature;
    const wlTx = await coord.post('/tx/waiting-list', {
      payload: patientPayload,
      signatures: [
        { actor: 'coordinador-nacional', signature: wlCoord },
        { actor: 'hospital-donante', signature: wlHosp },
      ],
    });
    if (!wlTx.data?.ok) {
      return { name, passed: false, detail: `Waiting-list: ${wlTx.data?.reason}` };
    }

    const compat = await donante.post('/compatibility/query', {
      donorProfile: { bloodType: 'O+', hlaProfile: donorPayload.hlaProfile },
      waitingList: [patientPayload],
    });
    const assignmentPayload = {
      donorId,
      recipientId: patientId,
      organ: 'kidney',
      compatibilityTimestamp: compat.data.compatibilityTimestamp,
    };
    const asCoord = (await coord.post('/sign', { payload: assignmentPayload })).data.signature;
    const asHosp = (await donante.post('/sign', { payload: assignmentPayload })).data.signature;
    const asTx = await donante.post('/tx/assignment', {
      payload: assignmentPayload,
      signatures: [
        { actor: 'coordinador-nacional', signature: asCoord },
        { actor: 'hospital-donante', signature: asHosp },
      ],
    });
    if (!asTx.data?.ok) {
      return { name, passed: false, detail: `Assignment: ${asTx.data?.reason}` };
    }

    const soloReceptor = await receptor.post('/tx/reception', {
      payload: receptionPayload,
      signatures: [
        {
          actor: 'hospital-receptor',
          signature: (await receptor.post('/sign', { payload: receptionPayload })).data.signature,
        },
      ],
    });
    if (soloReceptor.data?.ok) {
      return { name, passed: false, detail: 'Recepción con una sola firma fue aceptada' };
    }

    const okRx = await receptor.post('/tx/reception', {
      payload: receptionPayload,
      signatures: [
        {
          actor: 'hospital-receptor',
          signature: (await receptor.post('/sign', { payload: receptionPayload })).data.signature,
        },
        {
          actor: 'coordinador-nacional',
          signature: (await coord.post('/sign', { payload: receptionPayload })).data.signature,
        },
      ],
    });
    if (!okRx.data?.ok) {
      return { name, passed: false, detail: `Recepción válida rechazada: ${okRx.data?.reason}` };
    }

    const dup = await receptor.post('/tx/reception', {
      payload: receptionPayload,
      signatures: [
        {
          actor: 'hospital-receptor',
          signature: (await receptor.post('/sign', { payload: receptionPayload })).data.signature,
        },
        {
          actor: 'coordinador-nacional',
          signature: (await coord.post('/sign', { payload: receptionPayload })).data.signature,
        },
      ],
    });
    if (dup.data?.ok) {
      return { name, passed: false, detail: 'Segunda recepción del mismo órgano fue aceptada' };
    }

    const caso = await coord.get(`/dashboard/casos/${encodeURIComponent(donorId)}`);
    if (!caso.data?.state?.receptionInfo || !caso.data?.summary?.isClosed) {
      return { name, passed: false, detail: 'La proyección no marca el caso como cerrado' };
    }

    return {
      name,
      passed: true,
      detail: 'Recepción: circuito cerrado por hospital-receptor + coordinador-nacional; duplicado rechazado',
    };
  } catch (err) {
    return {
      name,
      passed: false,
      detail: `Error: ${err.message}`,
    };
  }
}

module.exports = { run };
