/**
 * Invented job pages that mirror the structure of real ones on each
 * application system. Used to test job capture without real postings.
 */

export const GREENHOUSE_PAGE = `<!doctype html><html><head>
<title>Job Application for Software Developer Intern at Acme Robotics</title>
<meta property="og:title" content="Software Developer Intern">
</head><body>
<div class="job__header"><div class="job__title"><h1 class="section-header section-header--large font-primary">Software Developer Intern</h1>
<div class="job__location"><svg aria-hidden="true"></svg><div>Windsor, Ontario</div></div></div></div>
<div class="job__description body"><div>
<p>Acme Robotics builds <strong>warehouse robots</strong> that move 2 million parcels a day.</p>
<p>&nbsp;</p>
<p><strong>What you'll do</strong></p>
<ul><li>Build internal tools in TypeScript and React</li><li>Write Python services that talk to our robots<ul><li>Mostly gRPC</li></ul></li></ul>
<h3>What you'll need</h3>
<ul><li>Experience with Python, Go, or Rust</li><li>Comfort with Linux and Docker</li><li>Excellent communication skills</li></ul>
<p><strong>Benefits</strong></p>
<ul><li>Free lunch and an Excel-based budget for conferences</li></ul>
</div></div>
<form id="application-form"><input id="first_name"></form>
<script>window.secret = 1</script>
</body></html>`;

export const GREENHOUSE_EMBED_PAGE = `<!doctype html><html><head><title>Apply</title></head><body>
<form id="application_form"><input name="job_application[first_name]"></form></body></html>`;

export const GREENHOUSE_API = {
  title: 'Data Engineer',
  company_name: 'Northwind',
  location: { name: 'Toronto, Ontario, Canada' },
  absolute_url: 'https://job-boards.greenhouse.io/northwind/jobs/4242',
  content:
    '&lt;p&gt;Northwind moves data for &lt;strong&gt;thousands&lt;/strong&gt; of stores.&lt;/p&gt;&lt;h3&gt;Requirements&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;SQL and Airflow&lt;/li&gt;&lt;li&gt;Experience with Snowflake or BigQuery&lt;/li&gt;&lt;/ul&gt;',
};

export const LEVER_APPLY_PAGE = `<!doctype html><html><head>
<title>Acme Robotics - Software Developer Intern</title>
<meta property="og:title" content="Acme Robotics - Software Developer Intern">
</head><body>
<div class="section page-centered posting-header"><div class="posting-headline"><h2>Software Developer Intern</h2>
<div class="posting-categories"><div class="sort-by-time posting-category location">Windsor, ON</div></div></div></div>
<form id="application-form"><input name="name"></form></body></html>`;

export const LEVER_POSTING_PAGE = `<!doctype html><html><head>
<title>Acme Robotics - Software Developer Intern</title>
<script type="application/ld+json">${JSON.stringify({
  '@context': 'http://schema.org',
  '@type': 'JobPosting',
  title: 'Software Developer Intern',
  hiringOrganization: { '@type': 'Organization', name: 'Acme Robotics' },
  jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Windsor, ON', addressRegion: null, addressCountry: null } },
  description:
    '<p><strong>About the team</strong></p><p>We build robots.</p><p>&nbsp;</p><p><strong>Requirements</strong></p><ul><li>Python and C++</li><li>ROS2 experience</li></ul>',
})}</script>
</head><body><div class="posting-headline"><h2>Software Developer Intern</h2></div></body></html>`;

export const ASHBY_PAGE = `<!doctype html><html><head>
<title> Security Engineer, Cloud @ Acme Robotics</title>
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org/',
  '@type': 'JobPosting',
  title: ' Security Engineer, Cloud',
  description:
    '<h1><strong>About Acme</strong></h1><p>Acme builds robots.</p><h2>What You Need</h2><ul><li>3 years building in AWS with Terraform</li><li>Python</li></ul><h2>Benefits</h2><ul><li>Health coverage</li></ul>',
  hiringOrganization: { '@type': 'Organization', name: 'Acme Robotics' },
  jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'New York City', addressRegion: 'NY', addressCountry: 'USA' } },
  jobLocationType: 'TELECOMMUTE',
  applicantLocationRequirements: [
    { '@type': 'Country', name: 'Canada' },
    { '@type': 'Country', name: 'United States' },
    { '@type': 'Country', name: 'USA' },
  ],
})}</script>
</head><body><div id="root"><input id="_systemfield_name"></div></body></html>`;

export const GENERIC_PAGE = `<!doctype html><html><head>
<title>Careers - Join Maple Leaf Analytics</title>
<meta property="og:site_name" content="Maple Leaf Analytics">
</head><body>
<nav><a href="/">Home</a> <a href="/careers">Careers</a></nav>
<h1>Junior Data Analyst (Co-op)</h1>
<p>Maple Leaf Analytics is hiring a co-op student for the fall term in Toronto, Ontario. You will build dashboards in Tableau and write SQL against our warehouse.</p>
<form id="apply"><label>First name <input name="fn"></label><textarea name="why">Why us?</textarea></form>
<footer>© Maple Leaf Analytics</footer>
</body></html>`;
