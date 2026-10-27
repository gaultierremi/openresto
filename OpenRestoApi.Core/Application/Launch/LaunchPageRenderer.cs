using System.Security.Cryptography;
using System.Text;
using OpenRestoApi.Core.Application.Legal;

namespace OpenRestoApi.Core.Application.Launch;

public sealed record LaunchPage(string Html, string ContentSecurityPolicy);

public static class LaunchPageRenderer
{
    public const string HomeTitle = "OpenResto — Réservations et carte QR pour votre restaurant";
    public const string HomeDescription = "Réservations en ligne, carte QR et site vitrine : réunissez l’essentiel pour votre restaurant. Votre premier établissement est gratuit, sans commission.";

    private const string Css = """
        :root{color-scheme:light;--ink:#182d29;--muted:#4d625b;--brand:#215d49;--paper:#faf9f5;--line:#d6dfd7}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:18px/1.65 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--brand);text-underline-offset:.22em}a:hover{text-decoration-thickness:2px}a:focus-visible,button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid #a34219;outline-offset:5px}header,main,footer{max-width:1180px;margin:auto;padding:24px}header{display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap}nav{display:flex;align-items:center;gap:24px;flex-wrap:wrap}.wordmark{font-size:25px;font-weight:800;letter-spacing:-1px;text-decoration:none}.wordmark span{color:var(--brand)}.skip{position:absolute;top:-100px;left:16px;background:white;padding:12px;z-index:2}.skip:focus{top:12px}main{padding-top:48px;padding-bottom:80px}h1,h2,h3,p{margin-top:0}h1{font-size:clamp(2.4rem,5.4vw,4.6rem);line-height:1.08;letter-spacing:-.045em;max-width:850px;margin-bottom:28px}h2{font-size:clamp(1.7rem,3vw,2.5rem);line-height:1.2;letter-spacing:-.025em}h3{font-size:1.2rem;line-height:1.35}.eyebrow{color:var(--brand);font-size:.82rem;font-weight:750;letter-spacing:.13em;text-transform:uppercase}.lead{font-size:1.22rem;max-width:690px;color:var(--muted)}.actions{display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin:28px 0}.cta,button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 23px;background:var(--brand);color:white;border:2px solid var(--brand);border-radius:8px;font:inherit;font-weight:650;text-decoration:none;cursor:pointer}.secondary{background:transparent;color:var(--brand)}.small{font-size:.9rem;color:var(--muted)}.hero{padding-bottom:60px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.card{padding:28px;border:1px solid var(--line);border-radius:16px;background:white}.number{display:block;color:var(--brand);font-size:.85rem;font-weight:750;margin-bottom:22px}.band{margin:64px 0;padding:40px;background:#eaf0e9;border-radius:20px}.band p{max-width:710px}.pill{display:inline-block;border:1px solid #a1b8ab;border-radius:99px;padding:5px 14px;font-size:.85rem;margin-bottom:24px}.price{font-size:3rem;font-weight:750;line-height:1.2}.steps{padding-left:24px}.steps li{padding-left:8px;margin-bottom:16px}section+section{margin-top:64px}details{padding:20px 0;border-bottom:1px solid var(--line)}summary{cursor:pointer;font-weight:650;min-height:44px}details p{max-width:800px;margin:12px 0}footer{border-top:1px solid var(--line);font-size:.9rem;padding-top:32px;padding-bottom:40px}.footer-links{display:flex;flex-wrap:wrap;gap:12px 24px}.form-card{max-width:620px;margin:0 auto}label{display:block;font-weight:650;margin-top:24px}input{width:100%;min-height:48px;font:inherit;padding:10px 12px;border:1px solid #768b80;border-radius:7px;background:white;color:var(--ink)}.notice{border-left:4px solid var(--brand);padding:16px 20px;background:#eaf0e9;margin:24px 0}.error{border-color:#a32e22;background:#fff0ed}.trap{display:none}.legal{max-width:820px}.legal h1{font-size:clamp(2rem,5vw,3rem)}.legal h2{font-size:1.35rem;margin-top:36px}.legal p{overflow-wrap:anywhere}@media(max-width:700px){body{font-size:16px}header,main,footer{padding-left:20px;padding-right:20px}header{gap:12px}nav{gap:10px 18px;font-size:.9rem}main{padding-top:30px}.grid{grid-template-columns:1fr}.band{padding:26px;margin:40px 0}section+section{margin-top:40px}.hero{padding-bottom:24px}.actions .cta{width:100%}}
        select,textarea{width:100%;min-height:48px;font:inherit;padding:10px 12px;border:1px solid #768b80;border-radius:7px;background:white;color:var(--ink)}select:focus-visible,textarea:focus-visible{outline:3px solid #a34219;outline-offset:5px}[hidden]{display:none!important}.dish-photo{width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;border-radius:8px}.soldout{color:var(--muted)}h4{font-size:1.1rem;margin:0 0 16px}h1,h2,h3,h4,p,a,strong{overflow-wrap:anywhere}
        """;

    public static LaunchPage Home(string baseUrl, string homePath, bool noIndex = false) => Page(HomeTitle, HomeDescription, baseUrl, homePath, """
        <section class="hero" aria-labelledby="intro">
          <p class="eyebrow">Votre restaurant en ligne depuis votre téléphone</p>
          <h1 id="intro">Gratuit pour les restaurateurs</h1>
          <p class="lead">Votre carte QR, votre page de réservation et vos réservations reçues au même endroit. Objectif : cinq minutes, votre carte et vos informations légales sous la main.</p>
          <div class="actions"><a class="cta" href="/inscription">Inscrire mon restaurant</a><a class="cta secondary" href="#demo">Voir la démonstration</a></div>
          <p class="small">Votre premier établissement est gratuit. Sans commission sur les réservations.</p>
        </section>
        <section id="demo" aria-labelledby="demo-title"><p class="eyebrow">Démonstration · données fictives</p><h2 id="demo-title">De votre carte à la première réservation</h2>
          <div class="grid"><article class="card"><span class="number">1 / VOTRE CARTE</span><h3>Le Jardin Démo</h3><p>Soupe du jour · 8,50 €<br>Plat du jardin · 18 €</p><p class="small">Photo ou texte collé → propositions à vérifier. Carte disponible en FR, NL et EN avec vos traductions.</p></article>
          <article class="card"><span class="number">2 / CÔTÉ CLIENT</span><h3>Une table pour deux</h3><p>Demain · 19:00 · 2 couverts</p><details><summary>Simuler la réception</summary><p role="status"><strong>Nouvelle réservation reçue</strong><br>Client Démo · 2 couverts · 19:00</p><p class="small">Exemple uniquement : aucune réservation créée, aucun e-mail envoyé.</p></details></article>
          <article class="card"><span class="number">3 / DANS VOTRE ESPACE</span><h3>Vous êtes prêt à recevoir</h3><p>Un lien public à partager, des QR à télécharger et imprimer, et les réservations dans votre espace sur téléphone.</p><a href="/inscription">Créer mon accès gratuit</a></article></div>
        </section>
        <section aria-labelledby="tools"><p class="eyebrow">Pour les restaurateurs</p><h2 id="tools">L’essentiel, à portée de main.</h2>
          <div class="grid">
            <article class="card"><span class="number">01 / RÉSERVATIONS</span><h3>Une table, au bon moment</h3><p>Vos clients choisissent un créneau disponible. Vous définissez les horaires, les salles et la capacité de vos tables.</p></article>
            <article class="card"><span class="number">02 / CARTE QR</span><h3>Votre carte toujours à jour</h3><p>Un code à poser sur la table, une carte à consulter sur téléphone. Modifiez les plats, les prix et les allergènes depuis votre espace.</p></article>
            <article class="card"><span class="number">03 / SITE VITRINE</span><h3>Une adresse à partager</h3><p>Présentez votre établissement, ses horaires et sa carte sur une page dédiée. Vos clients y trouvent aussi le chemin pour réserver.</p></article>
          </div>
        </section>
        <section class="band" aria-labelledby="offer"><span class="pill">Premier établissement gratuit</span><h2 id="offer">Commencez simplement.</h2><p class="price">0 €</p><p>Les réservations en ligne, la carte QR et le site vitrine sont inclus pour votre premier établissement. Aucune carte bancaire n’est demandée, aucune commission n’est prélevée.</p><p class="small">Pour un établissement supplémentaire, contactez l’équipe avant toute ouverture. Les conditions de l’offre gratuite précisent les modalités et les éventuelles évolutions du service.</p><a class="cta" href="/inscription">Créer mon accès gratuit</a></section>
        <section aria-labelledby="start"><p class="eyebrow">De l’inscription au premier service</p><h2 id="start">Vous avancez à votre rythme.</h2><ol class="steps"><li><strong>Vérifiez votre adresse e-mail.</strong> Recevez votre lien personnel et choisissez votre mot de passe après lecture des documents légaux.</li><li><strong>Préparez votre restaurant.</strong> Renseignez vos coordonnées, vos horaires, vos salles et vos tables. Ajoutez votre carte et votre identité visuelle, ou revenez-y plus tard.</li><li><strong>Vérifiez, puis publiez.</strong> Prévisualisez votre site et votre carte QR. Votre établissement reste invisible aux clients tant que vous ne l’avez pas publié.</li></ol></section>
        <section class="band" aria-labelledby="guests"><p class="eyebrow">Pour les clients</p><h2 id="guests">Votre prochaine table vous attend.</h2><p>Parcourez les restaurants, consultez leurs disponibilités et réservez sans créer de compte. Au restaurant, scannez le code QR pour lire la carte.</p><div class="actions"><a class="cta" href="/locations?lang=fr">Voir les restaurants</a><a href="/lookup?lang=fr">Retrouver ma réservation</a></div></section>
        <section aria-labelledby="faq"><h2 id="faq">Avant de commencer</h2>
          <details><summary>Ai-je besoin d’un site ou de matériel particulier ?</summary><p>Un navigateur et une connexion Internet suffisent pour préparer votre établissement. Votre site vitrine est inclus. Vous pouvez imprimer votre code QR depuis votre espace.</p></details>
          <details><summary>Puis-je préparer mon restaurant sans le publier ?</summary><p>Oui. L’assistant enregistre votre progression. Seule votre action de publication rend le restaurant visible et réservable.</p></details>
          <details><summary>Que deviennent les données de mes clients ?</summary><p>Le restaurant est responsable des données de réservation. OpenResto les traite pour son compte. La durée de conservation est réglable ; les nouveaux établissements démarrent à douze mois. Consultez la politique de confidentialité et l’accord de sous-traitance.</p></details>
          <details><summary>J’ai déjà un compte. Où me connecter ?</summary><p><a href="/onboarding/login?lang=fr">Ouvrir mon espace restaurateur</a>.</p></details>
        </section>
        """, homePath, noIndex);

    public static LaunchPage Registration(string baseUrl, string homePath, string token, string? error = null, bool enabled = true)
    {
        string body = enabled ? $$"""
            <div class="form-card"><p class="eyebrow">Premier établissement gratuit</p><h1>Bienvenue chez vous.</h1><p>Commençons par votre restaurant et votre adresse e-mail. Un lien personnel vous permettra de créer votre compte et de préparer votre établissement.</p>
            {{(error is null ? "" : $"<p class=\"notice error\" role=\"alert\">{E(error)}</p>")}}
            <form method="post" action="/inscription">
              <input type="hidden" name="__RequestVerificationToken" value="{{E(token)}}">
              <label for="name">Nom du restaurant</label><input id="name" name="Name" autocomplete="organization" required maxlength="100">
              <label for="email">Adresse e-mail professionnelle</label><input id="email" name="Email" type="email" autocomplete="email" required maxlength="254" aria-describedby="email-hint"><p id="email-hint" class="small">Utilisez une adresse à laquelle vous avez accès. Elle servira à vous connecter.</p>
              <div class="trap" aria-hidden="true"><label for="website">Laissez ce champ vide</label><input id="website" name="Website" tabindex="-1" autocomplete="off"></div>
              <p class="small">En demandant ce lien, vous nous confiez votre adresse pour préparer votre inscription. Aucun abonnement payant n’est souscrit. <a href="/legal/privacy">Lire la politique de confidentialité</a>.</p>
              <button type="submit">Recevoir mon lien d’inscription</button>
            </form><p class="small">Déjà inscrit ? <a href="/onboarding/login?lang=fr">Me connecter</a>.</p></div>
            """ : """
            <div class="form-card"><h1>Les inscriptions ne sont pas encore ouvertes.</h1><p>Vous avez reçu une invitation ? Ouvrez le lien de votre e-mail pour préparer votre établissement.</p><a class="cta" href="/onboarding/login?lang=fr">Me connecter</a></div>
            """;
        return Page("Inscrire mon restaurant gratuitement | OpenResto", "Créez votre accès restaurateur et préparez votre premier établissement gratuitement.", baseUrl, "/inscription", body, homePath, noIndex: true);
    }

    public static LaunchPage Sent(string baseUrl, string homePath) => Page("Vérifiez votre messagerie | OpenResto", "Retrouvez votre lien personnel d’inscription.", baseUrl, "/inscription/envoyee", """
        <div class="form-card"><p class="eyebrow">Prochaine étape</p><h1>Vérifiez votre messagerie.</h1><p>Si votre adresse peut être inscrite, vous allez recevoir un lien personnel pour créer votre compte. Il est valable quatorze jours.</p><p>Consultez aussi vos courriers indésirables. Attendez au moins dix minutes avant de demander un nouveau lien. Les envois sont limités à cinq par adresse sur vingt-quatre heures.</p><p>Vous avez déjà un compte ? <a href="/onboarding/login?lang=fr">Connectez-vous à votre espace</a>.</p><p><a href="/inscription">Corriger mon adresse ou demander un nouveau lien</a></p></div>
        """, homePath, noIndex: true);

    public static LaunchPage Legal(string baseUrl, string homePath, LegalDocument? document)
    {
        if (document is null)
            return Page("Document introuvable | OpenResto", "Ce document n’existe pas.", baseUrl, "/legal", "<h1>Document introuvable</h1><p><a href=\"/legal\">Voir les documents légaux</a></p>", homePath, noIndex: true);

        var body = new StringBuilder("<article class=\"legal\">");
        body.Append("<a href=\"/legal\">Tous les documents légaux</a><h1>").Append(E(document.Title)).Append("</h1>");
        if (LegalCatalog.NeedsLegalReview)
            body.Append("<p class=\"notice\" data-testid=\"legal-review-banner\">Modèle à compléter et à faire valider par un juriste avant le lancement public.</p>");
        body.Append("<p class=\"small\" data-testid=\"legal-version\">Version ").Append(E(document.Version)).Append(" · Texte en français</p>");
        foreach (LegalSection section in document.Sections)
        {
            body.Append("<section><h2>").Append(E(section.Heading)).Append("</h2>");
            foreach (string paragraph in section.Paragraphs)
                body.Append("<p>").Append(E(paragraph)).Append("</p>");
            body.Append("</section>");
        }
        body.Append("</article>");
        return Page($"{document.Title} | OpenResto", $"{document.Title} de la plateforme OpenResto. Version {document.Version}.", baseUrl, $"/legal/{document.Key}", body.ToString(), homePath, LegalCatalog.NeedsLegalReview);
    }

    public static LaunchPage LegalIndex(string baseUrl, string homePath) => Page("Documents légaux | OpenResto", "Conditions d’utilisation, confidentialité, accord de sous-traitance et mentions légales d’OpenResto.", baseUrl, "/legal",
        "<h1>Documents légaux</h1><p class=\"notice\" data-testid=\"legal-review-banner\">Modèles à compléter et à faire valider par un juriste avant le lancement public.</p><ul>" +
        string.Join("", LegalCatalog.All.Select(d => $"<li><a href=\"/legal/{E(d.Key)}\">{E(d.Title)}</a></li>")) + "</ul>", homePath, noIndex: LegalCatalog.NeedsLegalReview);

    public static LaunchPage Page(string title, string description, string baseUrl, string path, string body, string homePath = "/decouvrir", bool noIndex = false, string? script = null)
    {
        string canonical = baseUrl.TrimEnd('/') + path;
        string hash = Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(Css)));
        string csp = $"default-src 'none'; img-src 'self' data:; style-src 'sha256-{hash}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
        if (script is not null)
            csp += $"; script-src 'sha256-{Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(script)))}'; connect-src 'self'";
        string html = $$"""
            <!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{E(title)}}</title><meta name="description" content="{{E(description)}}"><meta name="robots" content="{{(noIndex ? "noindex,follow" : "index,follow")}}"><link rel="canonical" href="{{E(canonical)}}"><meta property="og:type" content="website"><meta property="og:locale" content="fr_BE"><meta property="og:title" content="{{E(title)}}"><meta property="og:description" content="{{E(description)}}"><meta property="og:url" content="{{E(canonical)}}"><meta name="theme-color" content="#215d49"><link rel="icon" href="data:,"><style>{{Css}}</style></head><body><a class="skip" href="#contenu">Aller au contenu</a><header><a class="wordmark" href="{{E(homePath)}}" aria-label="OpenResto, accueil">Open<span>Resto</span></a><nav aria-label="Navigation principale"><a href="/locations?lang=fr">Trouver une table</a><a href="/onboarding/login?lang=fr">Espace restaurateur</a></nav></header><main id="contenu">{{body}}</main><footer><p>OpenResto · Plus de temps pour le service.</p><nav class="footer-links" aria-label="Informations légales"><a href="/legal/legal-notice">Mentions légales</a><a href="/legal/privacy">Confidentialité</a><a href="/legal/terms">Conditions d’utilisation</a><a href="/legal/dpa">Accord de sous-traitance</a></nav></footer></body></html>
            """;
        if (script is not null) html = html.Replace("</body>", $"<script>{script}</script></body>", StringComparison.Ordinal);
        return new LaunchPage(html, csp);
    }

    public static string E(string value) => value.Replace("&", "&amp;", StringComparison.Ordinal)
        .Replace("<", "&lt;", StringComparison.Ordinal).Replace(">", "&gt;", StringComparison.Ordinal)
        .Replace("\"", "&quot;", StringComparison.Ordinal).Replace("'", "&#39;", StringComparison.Ordinal);
}
