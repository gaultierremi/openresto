namespace OpenRestoApi.Core.Application.Launch;

public static class GuestInteraction
{
    public const string Script = """
        (() => {
          'use strict';
          const status = document.getElementById('guest-status');
          const result = document.getElementById('guest-result');
          const title = document.getElementById('result-title');
          const cancel = document.getElementById('guest-cancel');
          let current = null;
          const message = text => { status.textContent = text; status.hidden = false; };
          const request = async (url, data, method = 'POST') => {
            const response = await fetch(url, {
              method, credentials: 'same-origin', cache: 'no-store',
              ...(data ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {})
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
              const error = new Error('request failed');
              error.status = response.status;
              throw error;
            }
            return body;
          };
          const show = async (booking, name, zone, confirmed) => {
            current = booking;
            let restaurant = { name, timezone: zone };
            if (!name) {
              try { restaurant = await request('/api/restaurants/' + booking.restaurantId, null, 'GET'); }
              catch { restaurant = { name: 'Votre restaurant', timezone: 'Europe/Brussels' }; }
            }
            title.textContent = booking.isCancelled ? 'Réservation annulée' : confirmed ? 'Réservation confirmée' : 'Votre réservation';
            document.getElementById('result-reference').textContent = booking.bookingRef;
            const date = new Intl.DateTimeFormat('fr-BE', { dateStyle: 'full', timeStyle: 'short', timeZone: restaurant.timezone }).format(new Date(booking.date));
            document.getElementById('result-details').textContent = restaurant.name + ' · ' + date + ' · ' + booking.seats + (booking.seats === 1 ? ' couvert · ' : ' couverts · ') + booking.customerEmail;
            status.hidden = true;
            result.hidden = false;
            cancel.hidden = booking.isCancelled || new Date(booking.date) <= new Date();
            title.focus();
          };
          const bookingForm = document.getElementById('guest-booking');
          if (bookingForm) bookingForm.addEventListener('submit', async event => {
            event.preventDefault();
            const button = bookingForm.querySelector('button[type="submit"]');
            if (button.disabled) return;
            button.disabled = true;
            message('Confirmation en cours…');
            let hold = null;
            let attempted = false;
            try {
              const fields = new FormData(bookingForm);
              const shared = { restaurantId: Number(bookingForm.dataset.restaurantId), seats: Number(bookingForm.dataset.seats), date: fields.get('slot') };
              hold = await request('/api/holds', shared);
              attempted = true;
              const booking = await request('/api/bookings', {
                ...shared, holdId: hold.holdId, tableId: hold.tableId, sectionId: hold.sectionId,
                tableGroupId: hold.tableGroupId, customerName: fields.get('customerName'),
                customerEmail: fields.get('customerEmail'), specialRequests: fields.get('specialRequests'), locale: 'fr'
              });
              bookingForm.hidden = true;
              document.querySelector('[data-testid="public-availability"]').hidden = true;
              history.replaceState(null, '', '/booking-confirmation/' + encodeURIComponent(booking.bookingRef));
              document.title = 'Réservation confirmée | OpenResto';
              await show(booking, bookingForm.dataset.name, bookingForm.dataset.timezone, true);
            } catch (error) {
              message(error.status === 429 ? 'Trop de demandes. Patientez un moment avant de réessayer.' :
                error.status === 400 || error.status === 409 ? 'Ce créneau ne peut plus être réservé. Vérifiez les disponibilités et vos coordonnées.' :
                attempted ? 'La confirmation n’a pas pu être vérifiée. Consultez votre messagerie ou recherchez votre réservation avant de recommencer.' :
                'Le service est momentanément indisponible. Réessayez plus tard ou contactez le restaurant.');
              if (hold) request('/api/holds/' + encodeURIComponent(hold.holdId), null, 'DELETE').catch(() => {});
            } finally { button.disabled = false; }
          });
          const lookup = document.getElementById('guest-lookup');
          if (lookup) lookup.addEventListener('submit', async event => {
            event.preventDefault();
            const button = lookup.querySelector('button');
            if (button.disabled) return;
            button.disabled = true;
            result.hidden = true;
            message('Recherche en cours…');
            const fields = new FormData(lookup);
            try {
              const booking = await request('/api/bookings/ref/' + encodeURIComponent(String(fields.get('reference')).trim()) + '?email=' + encodeURIComponent(String(fields.get('email')).trim()), null, 'GET');
              await show(booking, null, null, false);
            } catch (error) {
              message(error.status === 404 ? 'Aucune réservation ne correspond à cette référence et à cet e-mail.' :
                error.status === 429 ? 'Trop de recherches. Patientez avant de réessayer.' : 'La recherche est momentanément indisponible. Contactez le restaurant si nécessaire.');
            } finally { button.disabled = false; }
          });
          cancel.addEventListener('click', async () => {
            if (!current || cancel.disabled || !window.confirm('Annuler cette réservation ?')) return;
            cancel.disabled = true;
            try {
              await request('/api/bookings/ref/' + encodeURIComponent(current.bookingRef) + '/cancel', { email: current.customerEmail });
              current.isCancelled = true;
              title.textContent = 'Réservation annulée';
              cancel.hidden = true;
              message('Votre réservation a été annulée.');
            } catch { message('L’annulation n’a pas abouti. Votre réservation reste valable. Contactez le restaurant.'); }
            finally { cancel.disabled = false; }
          });
        })();
        """;
}
