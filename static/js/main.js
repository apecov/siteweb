/**
 * APECO Voirets - Frontend JavaScript
 * Mobile menu toggle, form helpers, and clipboard utilities
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Mobile Menu Toggle
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu = document.querySelector('.nav-menu');

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', !isExpanded);
      navMenu.classList.toggle('open');
    });

    // Close menu when clicking outside
    document.addEventListener('click', (event) => {
      if (!navToggle.contains(event.target) && !navMenu.contains(event.target) && navMenu.classList.contains('open')) {
        navMenu.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // 2. Clipboard Copy Utility (e.g. for IBAN)
  const copyButtons = document.querySelectorAll('[data-copy-target]');
  copyButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetSelector = btn.getAttribute('data-copy-target');
      const targetElement = document.querySelector(targetSelector);
      if (targetElement) {
        const textToCopy = targetElement.innerText || targetElement.value;
        navigator.clipboard.writeText(textToCopy).then(() => {
          const originalText = btn.innerText;
          btn.innerText = '✓ Copié !';
          btn.classList.add('btn-secondary');
          setTimeout(() => {
            btn.innerText = originalText;
            btn.classList.remove('btn-secondary');
          }, 2000);
        }).catch(err => {
          console.error('Failed to copy: ', err);
        });
      }
    });
  });

  // 3. Interactive Membership Form Handler
  const membershipForm = document.getElementById('membership-form');
  if (membershipForm) {
    membershipForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const parentName = document.getElementById('parent-name').value.trim();
      const parentEmail = document.getElementById('parent-email').value.trim();
      const parentPhone = document.getElementById('parent-phone').value.trim();
      const studentName = document.getElementById('student-name').value.trim();
      const studentGrade = document.getElementById('student-grade').value;
      const paymentMethod = document.querySelector('input[name="payment_method"]:checked')?.value || 'Virement bancaire';
      const notes = document.getElementById('notes')?.value.trim() || '';

      if (!parentName || !parentEmail || !studentName) {
        alert('Veuillez remplir les champs obligatoires (*) pour finaliser votre adhésion.');
        return;
      }

      // Display confirmation
      const confirmationCard = document.getElementById('membership-confirmation');
      const confirmationDetails = document.getElementById('confirmation-details');
      
      const emailBody = [
        `Demande d'adhésion APECO Voirets`,
        `----------------------------------------`,
        `Parent : ${parentName}`,
        `E-mail : ${parentEmail}`,
        `Téléphone : ${parentPhone}`,
        `Élève : ${studentName} (${studentGrade})`,
        `Mode de cotisation : ${paymentMethod} (20 CHF)`,
        notes ? `Remarques : ${notes}` : ''
      ].filter(Boolean).join('\n');

      if (confirmationCard && confirmationDetails) {
        confirmationDetails.innerHTML = `
          <div class="alert alert-success">
            <strong>Merci beaucoup, ${parentName} !</strong><br>
            Votre demande d'adhésion pour l'année scolaire a bien été préparée pour votre enfant <strong>${studentName}</strong> (${studentGrade}).
          </div>
          <p>Pour confirmer votre inscription auprès du comité, veuillez cliquer ci-dessous pour transmettre automatiquement votre fiche par e-mail, ou effectuer directement votre versement de <strong>20 CHF</strong> avec la référence indiquée :</p>
          <div style="margin: 1.5rem 0; display: flex; gap: 1rem; flex-wrap: wrap;">
            <a href="mailto:contact@apeco-voirets.ch?subject=${encodeURIComponent("Adhésion APECO - " + studentName)}&body=${encodeURIComponent(emailBody)}" class="btn btn-primary">
              ✉️ Envoyer ma demande par e-mail
            </a>
            <button type="button" class="btn btn-outline" onclick="window.print()">
              🖨️ Imprimer le récapitulatif
            </button>
          </div>
        `;
        confirmationCard.style.display = 'block';
        confirmationCard.scrollIntoView({ behavior: 'smooth' });
        membershipForm.style.display = 'none';
      }
    });
  }

  // 4. Contact Form Handler
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('contact-name').value.trim();
      const email = document.getElementById('contact-email').value.trim();
      const subject = document.getElementById('contact-subject').value.trim();
      const message = document.getElementById('contact-message').value.trim();

      if (!name || !email || !message) {
        alert('Veuillez renseigner votre nom, e-mail et votre message.');
        return;
      }

      const mailtoUrl = `mailto:contact@apeco-voirets.ch?subject=${encodeURIComponent("[APECO Voirets] " + (subject || "Contact"))}&body=${encodeURIComponent("De: " + name + " (" + email + ")\n\n" + message)}`;
      window.location.href = mailtoUrl;
    });
  }
});
