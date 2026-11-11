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

// Workday: the public job data its posting pages load (/wday/cxs/…). The
// hiring organization is a legal entity, as on real tenants.
export const WORKDAY_API = {
  jobPostingInfo: {
    id: '0aa1',
    title: 'Software Developer, Robotics Platform',
    jobDescription:
      '<p>Acme Robotics builds warehouse robots.</p><p><b>What you’ll be doing:</b></p><ul><li>Build services in Go and Python</li><li>Ship tooling with React</li></ul><p><b>What we need to see:</b></p><ul><li>Experience with Kubernetes</li></ul>',
    location: 'CA, ON, Toronto',
    postedOn: 'Posted 3 Days Ago',
    timeType: 'Full time',
    jobReqId: 'JR1234567',
    country: { descriptor: 'Canada', id: 'c1' },
    canApply: true,
    externalUrl: 'https://acme.wd3.myworkdayjobs.com/AcmeCareers/job/CA-ON-Toronto/Software-Developer--Robotics-Platform_JR1234567',
  },
  hiringOrganization: { name: '1100 ACME Robotics Canada ULC', url: '' },
  similarJobs: [],
  userAuthenticated: false,
};

// iCIMS: the posting page inside the career site's iframe carries JSON-LD;
// the sign-in step that follows "Apply" carries nothing about the job.
export const ICIMS_JOB_PAGE = `<!doctype html><html><head><title>Software Developer Co-op in Waterloo, Ontario | Careers at Waterloo</title>
<script type="application/ld+json">{"@context":"http://schema.org","@type":"JobPosting","title":"Software Developer Co-op","hiringOrganization":{"@type":"Organization","name":"Northwind Systems, Inc"},"jobLocation":[{"@type":"Place","address":{"@type":"PostalAddress","streetAddress":"10 King St","addressLocality":"Waterloo","addressRegion":"ON","postalCode":"N2L 3G1","addressCountry":"CA"}}],"description":"&lt;p&gt;Join the team that builds &lt;b&gt;secure radios&lt;/b&gt;.&lt;/p&gt;&lt;p&gt;&lt;b&gt;Basic Qualifications&lt;/b&gt;&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Studying computer science&lt;/li&gt;&lt;li&gt;Experience with C++ or Python&lt;/li&gt;&lt;/ul&gt;"}</script>
</head><body><div class="iCIMS_MainWrapper"><div class="iCIMS_JobContainer"><h1 class="iCIMS_Header">Software Developer Co-op</h1>
<a class="iCIMS_Anchor iCIMS_Action_Button iCIMS_ApplyOnlineButton iCIMS_PrimaryButton" href="/jobs/1234/software-developer-co-op/job?mode=apply&apply=yes&in_iframe=1">Apply for this job online</a></div></div></body></html>`;

export const ICIMS_LOGIN_PAGE = `<!doctype html><html><head><title>Login | Careers at Waterloo</title></head><body>
<div class="iCIMS_MainWrapper"><form><label for="email">Email</label><input type="email" id="email" name="css_loginName" autocomplete="email">
<input type="checkbox" id="accept_gdpr" name="accept_gdpr"><label for="accept_gdpr">I agree</label>
<input type="submit" id="enterEmailSubmitButton" value="Next"></form></div></body></html>`;

// SmartRecruiters: its public posting API (open to any site), and the
// posting page's own microdata, for when the API can't be reached.
export const SMARTRECRUITERS_API = {
  id: '744000123456789',
  uuid: '0b9e3c1a-5f7d-4e2b-9c8a-1d2e3f4a5b6c',
  name: 'Tools Programmer (Python)',
  postingUrl: 'https://jobs.smartrecruiters.com/AcmeGames/744000123456789-tools-programmer-python-',
  company: { identifier: 'AcmeGames', name: 'Acme Games' },
  location: { city: 'Montreal', region: 'QC', country: 'ca', remote: false, hybrid: false, fullLocation: 'Montreal, QC, Canada' },
  jobAd: {
    sections: {
      companyDescription: { title: 'Company Description', text: '<p>Acme Games makes games.</p>' },
      jobDescription: { title: 'Job Description', text: '<p>Build the tools our artists use.</p>' },
      qualifications: { title: 'Qualifications', text: '<ul><li>5+ years of Python</li><li>Experience with REST APIs and PostgreSQL</li></ul>' },
      additionalInformation: { title: 'Additional Information', text: '<p>Hybrid, three days a week in the studio.</p>' },
    },
  },
};

export const SMARTRECRUITERS_POSTING_PAGE = `<!doctype html><html><head><title>Acme Games Tools Programmer (Python) | SmartRecruiters</title></head><body>
<main class="jobad-main job" itemscope itemtype="http://schema.org/JobPosting" role="main">
<h1 class="job-title" itemprop="title">Tools Programmer (Python) </h1>
<ul class="job-details"><li itemprop="jobLocation" itemscope itemtype="http://schema.org/Place"><span itemprop="address" itemscope itemtype="http://schema.org/PostalAddress">
<spl-job-location formattedaddress="Montreal, QC, Canada"></spl-job-location><meta itemprop="addressCountry" content="Canada"><meta itemprop="addressLocality" content="Montreal"><meta itemprop="addressRegion" content="Québec"></span></li>
<li itemprop="employmentType">Full-time</li></ul>
<div itemprop="hiringOrganization" itemscope itemtype="http://schema.org/Organization"><meta itemprop="name" content="Acme Games"></div>
<div class="job-sections"><div itemprop="description">
<section class="job-section" id="st-jobDescription"><div><h2 class="title">Job Description</h2></div><div class="wysiwyg" itemprop="responsibilities"><p>Build the tools our artists use every day.</p></div></section>
<section class="job-section" id="st-qualifications"><div><h2 class="title">Qualifications</h2></div><div class="wysiwyg" itemprop="qualifications"><ul><li>5+ years of Python</li><li>Experience with REST APIs</li></ul></div></section>
</div></div>
<a href="https://jobs.smartrecruiters.com/oneclick-ui/company/AcmeGames/publication/0b9e3c1a-5f7d-4e2b-9c8a-1d2e3f4a5b6c?dcr_ci=AcmeGames">I'm interested</a>
</main></body></html>`;

// Workable: the job data its apply pages load.
export const WORKABLE_API = {
  shortcode: 'B4F2A19C7D',
  title: 'Junior Backend Developer',
  remote: false,
  workplace: 'hybrid',
  location: { country: 'Canada', countryCode: 'CA', city: 'Vancouver', region: 'British Columbia' },
  locations: [{ country: 'Canada', countryCode: 'CA', city: 'Vancouver', region: 'British Columbia' }],
  description: '<p>Northwind Freight moves goods across Canada.</p>',
  requirements: '<ul><li>Node.js or Python</li><li>Comfort with SQL</li></ul>',
  benefits: '<ul><li>Health and dental from day one</li></ul>',
};

export const WORKABLE_APPLY_PAGE = `<!doctype html><html><head><title>Junior Backend Developer - Northwind Freight</title></head><body>
<main><h1>Junior Backend Developer</h1><form><label for="firstname">First name</label><input id="firstname" name="firstname"></form></main></body></html>`;
