(function () {
  'use strict';

  function create(options) {
    const { state, t, date, findMember, reload } = options;

    function updatePremiumFields() {
      const form = document.getElementById('mmActionForm');
      const field = document.getElementById('mmDurationField');
      const preview = document.getElementById('mmExpectedExpiry');
      const type = form.elements.grantType.value;
      const permanent = type === 'permanent';
      field.hidden = permanent;
      form.elements.durationDays.disabled = permanent;
      form.elements.durationDays.required = !permanent;
      if (type === 'trial' && !form.elements.durationDays.value) form.elements.durationDays.value = '7';
      if (type === 'timed' && !form.elements.durationDays.value) form.elements.durationDays.value = '30';
      if (permanent) {
        preview.textContent = `${t('expectedExpiry')}: ${t('unlimited')}`;
        return;
      }
      const days = Number(form.elements.durationDays.value);
      preview.textContent = Number.isInteger(days) && days >= 1 && days <= 3650
        ? `${t('expectedExpiry')}: ${date(Date.now() + days * 86400000, true)}` : t('durationRange');
    }

    function open(button) {
      const member = findMember(button.dataset.id);
      if (!member || member.is_admin || member.user_id === state.adminUser.id) return;
      const form = document.getElementById('mmActionForm');
      form.reset();
      form.elements.memberId.value = member.user_id;
      form.elements.action.value = button.dataset.memberAction;
      form.elements.tier.value = button.dataset.tier || '';
      document.getElementById('mmTarget').textContent = member.email || '';
      document.getElementById('mmDeleteFields').hidden = button.dataset.memberAction !== 'delete';
      document.getElementById('mmPremiumFields').hidden = !(button.dataset.memberAction === 'set_tier' && button.dataset.tier === 'premium');
      updatePremiumFields();
      document.getElementById('mmNote').textContent = button.dataset.memberAction === 'set_tier' && button.dataset.tier === 'general'
        ? t('adminSourceNote') : button.dataset.memberAction === 'delete' ? t('deleteHint') : '';
      document.getElementById('mmActionMessage').textContent = '';
      document.getElementById('mmDialog').showModal();
    }

    async function submit(event) {
      event.preventDefault();
      if (state.busy) return;
      const form = event.currentTarget;
      const member = findMember(form.elements.memberId.value);
      if (!member || member.is_admin || member.user_id === state.adminUser.id) return;
      const reason = form.elements.reason.value.trim();
      if (reason.length < 2) { form.elements.reason.reportValidity(); return; }
      const action = form.elements.action.value;
      const premiumGrant = action === 'set_tier' && form.elements.tier.value === 'premium';
      const grantType = premiumGrant ? form.elements.grantType.value : null;
      const durationDays = premiumGrant && grantType !== 'permanent' ? Number(form.elements.durationDays.value) : null;
      if (premiumGrant && grantType !== 'permanent'
          && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650)) {
        form.elements.durationDays.setCustomValidity(t('durationRange'));
        form.elements.durationDays.reportValidity();
        form.elements.durationDays.setCustomValidity('');
        return;
      }
      const confirmEmail = form.elements.confirmEmail.value.trim().toLowerCase();
      if (action === 'delete' && confirmEmail !== String(member.email || '').toLowerCase()) {
        document.getElementById('mmActionMessage').textContent = t('deleteHint');
        form.elements.confirmEmail.focus();
        return;
      }
      const session = await state.SB.auth.getSession();
      let token = session.data?.session?.access_token;
      if (!token) { document.getElementById('mmActionMessage').textContent = t('sessionExpired'); return; }
      state.busy = true;
      const submitButton = document.getElementById('mmSubmit');
      submitButton.disabled = true;
      submitButton.textContent = t('processing');
      try {
        const requestBody = JSON.stringify({
          action, targetId: member.user_id, tier: form.elements.tier.value,
          grantType: grantType, durationDays: durationDays, reason, confirmEmail,
        });
        const sendRequest = accessToken => fetch('/api/admin/members/action', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Accept-Language': state.lang },
          body: requestBody,
        });
        let response = await sendRequest(token);
        let result = await response.json().catch(() => ({}));
        const refreshable = response.status === 401
          && ['ADMIN_SESSION_TOKEN_INVALID', 'ADMIN_SESSION_VERIFY_FAILED'].includes(result.code);
        if (refreshable) {
          const refreshed = await state.SB.auth.refreshSession();
          token = refreshed.data?.session?.access_token;
          if (token) {
            response = await sendRequest(token);
            result = await response.json().catch(() => ({}));
          }
        }
        if (!response.ok) throw new Error(result.message || t('actionError'));
        document.getElementById('mmDialog').close();
        await reload();
      } catch (error) {
        document.getElementById('mmActionMessage').textContent = error.message || t('actionError');
      } finally {
        state.busy = false;
        submitButton.disabled = false;
        submitButton.textContent = t('apply');
      }
    }

    function bind() {
      document.getElementById('mmActionForm').onsubmit = submit;
      document.getElementById('mmActionForm').elements.grantType.onchange = event => {
        if (event.target.value === 'trial') event.currentTarget.form.elements.durationDays.value = '7';
        if (event.target.value === 'timed') event.currentTarget.form.elements.durationDays.value = '30';
        updatePremiumFields();
      };
      document.getElementById('mmActionForm').elements.durationDays.oninput = updatePremiumFields;
      document.getElementById('mmDialog').onclick = event => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      };
    }

    return { bind, open };
  }

  window.AdminMemberActions = { create };
}());
