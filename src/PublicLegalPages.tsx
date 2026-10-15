import { ArrowRight, CircleHelp, ExternalLink, Heart, Phone, ShieldCheck, Siren } from 'lucide-react'
import { Link } from 'react-router-dom'

function Brand(){
  return <Link className="brand" to="/"><span className="brand-mark"><Heart size={16} fill="currentColor" strokeWidth={0}/></span><span>care<span className="brand-sync">sync</span></span></Link>
}

export function ContactUs(){
  return <div className="landing public-contact">
    <nav className="landing-nav"><Brand/><div className="landing-links"><Link to="/about">About us</Link><Link to="/terms">Terms</Link></div><div className="nav-actions"><Link className="btn btn-ghost" to="/">Home</Link><Link className="btn btn-primary btn-sm" to="/login">Get started <ArrowRight size={15}/></Link></div></nav>
    <main className="contact-main">
      <section className="contact-hero"><div className="wrap"><div className="eyebrow"><span className="eyebrow-dot"/>CONTACT CARESYNC</div><h1>We’re here to help.</h1><p>For help using CareSync or questions about your account, contact our support line.</p></div></section>
      <section className="wrap contact-content">
        <article className="contact-card"><div className="contact-icon"><Phone/></div><div className="eyebrow">CARESYNC SUPPORT LINE</div><h2>Talk to our support team</h2><p>Call us for non-emergency help with the CareSync service.</p><a className="contact-phone" href="tel:8868010810">8868010810 <ArrowRight size={17}/></a><small>CareSync support is not an emergency service.</small></article>
        <aside className="contact-emergency"><Siren/><div><div className="eyebrow">MEDICAL OR OTHER EMERGENCY</div><h2>Call emergency services directly.</h2><p>CareSync does not dispatch ambulances or send emergency responders. If you are in India and need urgent help, call <a href="tel:112">112</a>. If you are elsewhere, call your local emergency number.</p><a className="emergency-source" href="https://112.gov.in/" target="_blank" rel="noreferrer">India Emergency Response Support System <ExternalLink size={13}/></a></div></aside>
      </section>
      <section className="wrap contact-note"><CircleHelp/><p>Please don’t send medical records or urgent health details through this page. For care questions, contact your healthcare provider directly.</p></section>
    </main>
    <footer className="footer"><div className="wrap footer-top"><Brand/><span>Thoughtful care, all in one place.</span><div><Link to="/">Home</Link><Link to="/about">About us</Link><Link to="/terms">Terms</Link><span>© 2026 CareSync</span></div></div></footer>
  </div>
}

export function Terms(){
  return <div className="legal-page">
    <header><Brand/><div><Link to="/contact">Contact us</Link><Link to="/">Home</Link></div></header>
    <article className="terms-document">
      <div className="eyebrow">CARESYNC · SERVICE TERMS</div><h1>Terms and Conditions</h1><p className="legal-lead">Last updated October 15, 2026. These terms describe use of the CareSync website and early-stage demo.</p>
      <div className="terms-draft-note"><ShieldCheck/><p><b>Working draft:</b> CareSync is still under development. These terms need review for the locations where the service will be offered before public launch. This page is not a privacy notice.</p></div>
      <h2>1. Using CareSync</h2><p>By accessing CareSync, you agree to use the service responsibly and follow these terms. If you do not agree, do not use the service. If you use CareSync on behalf of another person or organization, you must be authorized to do so.</p>
      <h2>2. What the service provides</h2><p>CareSync is a healthcare coordination product intended to help people explore provider information, organize appointment requests, and share visit feedback. Some screens and workflows are demonstrations. Features may be unavailable, incomplete, or changed while the product is being developed.</p>
      <h2>3. Not medical care or emergency response</h2><p>CareSync is not a healthcare provider and does not diagnose, treat, or prevent any condition. Directory information and user reviews are provided for general information and are not a substitute for advice from a qualified healthcare professional. Do not delay professional care based on information in CareSync.</p><p>Emergo does not place emergency calls, transmit your location to responders, or dispatch an ambulance. In an emergency, contact local emergency services directly. In India, the official emergency response number is 112.</p>
      <h2>4. Accounts and account security</h2><p>You are responsible for providing accurate account information, protecting your sign-in credentials, and notifying the service operator if you believe your account has been accessed without permission. Do not share another person’s account or use their information without authorization.</p>
      <h2>5. Provider information and appointments</h2><p>Provider profiles, qualifications, clinic details, ratings, and appointment availability may be supplied by providers or shown as fictional demo content. Check important details directly with the provider before relying on them. An appointment request is not a confirmed appointment unless the provider confirms it.</p>
      <h2>6. Reviews and community conduct</h2><p>Reviews should reflect your own experience and must not contain unlawful, deceptive, threatening, or private information about another person. CareSync may review, moderate, remove, or decline content that violates these terms or creates a safety or privacy concern.</p>
      <h2>7. Location and personal information</h2><p>Some features can request device location after you choose to use them. You decide whether to grant access and whether to share location details with another person. How personal information is handled depends on the live service configuration and applicable privacy information; do not enter sensitive health information into demo workflows.</p>
      <h2>8. Acceptable use</h2><p>Do not misuse the service, interfere with its operation, attempt unauthorized access, upload malicious code, impersonate another person, or use CareSync to harass or harm others.</p>
      <h2>9. Third-party services</h2><p>CareSync may link to maps, authentication providers, or other third-party services. Those services are operated independently and have their own terms and privacy practices. CareSync is not responsible for their content or availability.</p>
      <h2>10. Availability and changes</h2><p>CareSync is provided during development and may be changed, suspended, or discontinued. We may update these terms when the service changes. Continued use after an update means you accept the revised terms to the extent permitted by applicable law.</p>
      <h2>11. Disclaimers and liability</h2><p>To the extent permitted by applicable law, the demo is provided on an “as available” basis without promises that it will be uninterrupted, error-free, or suitable for a particular purpose. These terms do not limit any rights or remedies that cannot be limited under applicable law.</p>
      <h2>12. Contact</h2><p>Questions about these terms? Call CareSync support at <a href="tel:8868010810">8868010810</a>.</p>
      <Link className="btn btn-primary" to="/contact">Contact CareSync <ArrowRight size={15}/></Link>
    </article>
    <footer>© 2026 CareSync · <Link to="/about">About us</Link> · <Link to="/contact">Contact us</Link></footer>
  </div>
}
