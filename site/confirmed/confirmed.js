// Where the links in SmartSubmit's sync emails lead (the Supabase project's
// Site URL). Supabase checks the link, then sends the browser here with the
// outcome in the address: a session after a confirmation or a password
// reset, or an error. This page only reads that address to say what
// happened. It sends nothing anywhere.
(function () {
  'use strict';

  var hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  var query = new URLSearchParams(location.search);
  function get(name) {
    return hash.get(name) || query.get(name) || '';
  }

  var type = get('type');
  var errorCode = get('error_code');
  var error = get('error');
  var description = get('error_description').replace(/\+/g, ' ');

  var state = 'none';
  if (errorCode || error) state = 'expired';
  else if (type === 'recovery') state = 'recovery';
  else if (hash.has('access_token') || query.has('code') || type === 'signup' || type === 'email_change' || type === 'invite' || type === 'magiclink') state = 'confirmed';

  var sections = document.querySelectorAll('section[data-state]');
  for (var i = 0; i < sections.length; i++) sections[i].hidden = sections[i].getAttribute('data-state') !== state;

  if (state === 'recovery') {
    // SmartSubmit takes this address in place of the reset link it came from.
    var address = document.getElementById('address');
    var copy = document.getElementById('copy');
    address.value = location.href;
    address.addEventListener('focus', function () {
      address.select();
    });
    copy.addEventListener('click', function () {
      var done = function () {
        copy.textContent = 'Copied';
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(location.href).then(done, function () {
          address.focus();
          address.select();
        });
      } else {
        address.focus();
        address.select();
      }
    });
    return;
  }

  if (state === 'expired' && errorCode !== 'otp_expired' && description) {
    var detail = document.getElementById('detail');
    detail.textContent = 'The sync server said: ' + description;
    detail.hidden = false;
  }

  // The address can hold a sign-in that SmartSubmit doesn't need: take it
  // out of the address bar and this tab's history.
  if (location.hash || location.search) history.replaceState(null, '', location.pathname);
})();
