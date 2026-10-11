/**
 * APECO Voirets - Frontend JavaScript
 * Mobile menu toggle and the mailto-based membership and contact forms.
 * The recipient address and the fee come from the forms' data-* attributes,
 * which the build fills from data/site.json.
 */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  children.forEach((child) => node.append(child));
  return node;
}

function mailtoUrl(to, subject, body) {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

document.addEventListener('DOMContentLoaded', () => {
  // 1. Mobile Menu Toggle
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu = document.querySelector('.nav-menu');

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!isExpanded));
      navMenu.classList.toggle('open');
    });

    document.addEventListener('click', (event) => {
      if (!navToggle.contains(event.target) && !navMenu.contains(event.target) && navMenu.classList.contains('open')) {
        navMenu.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // 2. Membership Form: builds an e-mail to the committee
  const membershipForm = document.getElementById('membership-form');
  if (membershipForm) {
    membershipForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const value = (id) => document.getElementById(id).value.trim();
      const parentName = value('parent-name');
      const parentEmail = value('parent-email');
      const parentPhone = value('parent-phone');
      const studentName = value('student-name');
      const studentGrade = value('student-grade');
      const notes = value('notes');
      const acceptedStatuts = document.getElementById('accept-statuts').checked;
      const fee = membershipForm.dataset.fee;

      if (!parentName || !parentEmail || !parentPhone || !studentName || !acceptedStatuts) {
        alert('Veuillez remplir les champs obligatoires (*) et confirmer avoir pris connaissance des statuts.');
        return;
      }

      const emailBody = [
        "Demande d'adhésion APECO Voirets",
        '----------------------------------------',
        `Parent : ${parentName}`,
        `E-mail : ${parentEmail}`,
        `Téléphone : ${parentPhone}`,
        `Élève : ${studentName} (${studentGrade})`,
        `Cotisation : ${fee} CHF`,
        notes ? `Remarques : ${notes}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const confirmationCard = document.getElementById('membership-confirmation');
      const confirmationDetails = document.getElementById('confirmation-details');
      if (!confirmationCard || !confirmationDetails) return;

      const sendLink = el(
        'a',
        { href: mailtoUrl(membershipForm.dataset.mailto, `Adhésion APECO - ${studentName}`, emailBody), class: 'btn btn-primary' },
        ['✉️ Envoyer ma demande par e-mail']
      );
      const printButton = el('button', { type: 'button', class: 'btn btn-outline' }, ['🖨️ Imprimer le récapitulatif']);
      printButton.addEventListener('click', () => window.print());

      confirmationDetails.replaceChildren(
        el('div', { class: 'alert alert-success' }, [
          el('strong', {}, [`Merci beaucoup, ${parentName} !`]),
          el('br'),
          `Votre demande d'adhésion pour ${studentName} (${studentGrade}) est prête.`,
        ]),
        el('p', {}, [
          'Pour la transmettre au comité, cliquez ci-dessous : votre messagerie s\'ouvrira avec la demande déjà rédigée. ' +
            'Le comité vous communiquera ensuite les modalités de paiement de la cotisation.',
        ]),
        el('div', { style: 'margin: 1.5rem 0; display: flex; gap: 1rem; flex-wrap: wrap;' }, [sendLink, printButton])
      );
      confirmationCard.style.display = 'block';
      confirmationCard.scrollIntoView({ behavior: 'smooth' });
      membershipForm.style.display = 'none';
    });
  }

  // 3. Contact Form
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('contact-name').value.trim();
      const email = document.getElementById('contact-email').value.trim();
      const subject = document.getElementById('contact-subject').value.trim();
      const message = document.getElementById('contact-message').value.trim();

      if (!name || !email || !message) {
        alert('Veuillez renseigner votre nom, votre e-mail et votre message.');
        return;
      }

      window.location.href = mailtoUrl(
        contactForm.dataset.mailto,
        `[APECO Voirets] ${subject || 'Contact'}`,
        `De : ${name} (${email})\n\n${message}`
      );
    });
  }
});
