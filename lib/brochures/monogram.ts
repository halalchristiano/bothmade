/**
 * Monogram Custom Builders — Center Valley, PA.
 *
 * Every fact on these pages is one the concept itself puts on screen, and
 * the concept was written from Monogram's own material: the founding year,
 * the two partners, the project count, the award list, the townships, the
 * contract line. Nothing here is inferred about how they run the business
 * and nothing is asserted about their current website, because nobody has
 * audited it yet — see `comparison` in lib/brochure.ts for why that page is
 * missing rather than guessed at.
 *
 * Prices are absent on purpose. The tiers are selections; the figures come
 * out of lib/pricing.ts when the page renders.
 */

import { buildTiers, type BrochureInput } from '@/lib/brochure';

const SHOTS = '/brochures/monogram';

const tiers = buildTiers([
  {
    key: 'essential',
    name: 'The essentials',
    tagline: 'The concept, built and live, doing the job a website has to do.',
    forWho:
      'Right if the goal is simply to stop losing people who look you up and find something that does not match the work. Everything here is groundwork — it is what the next two tiers are built on top of, so nothing is wasted by starting here.',
    selection: {
      baseService: 'website',
      addOns: ['cms', 'copywriting', 'seo', 'local-seo', 'analytics', 'crm-setup'],
      clientType: 'smb',
      timeline: 'standard',
    },
  },
  {
    key: 'recommended',
    name: 'What we recommend',
    tagline: 'The site, plus the things that decide whether anybody finds it.',
    forWho:
      'The one we would pick. A site nobody can find is a brochure in a drawer, and thirty years of work photographs better than almost any competitor you have — this tier is about putting both of those to work rather than just publishing them.',
    selection: {
      baseService: 'website',
      addOns: [
        'cms',
        'copywriting',
        'seo',
        'local-seo',
        'analytics',
        'crm-setup',
        'performance-optimization',
        'video-content',
        'blog',
        'email-marketing',
        'maintenance',
        'hosting',
      ],
      clientType: 'smb',
      timeline: 'standard',
    },
  },
  {
    key: 'complete',
    name: 'Everything',
    tagline: 'The website becomes the front desk, the showroom and the job file.',
    forWho:
      'Right if you want the site to take work off the office rather than only bring work in — consultations booked without a phone call, clients checking their own build, and the 3D pool design people already come to you for available before they have booked anything.',
    selection: {
      baseService: 'website',
      addOns: [
        'cms',
        'copywriting',
        'seo',
        'local-seo',
        'analytics',
        'crm-setup',
        'performance-optimization',
        'video-content',
        'blog',
        'email-marketing',
        'hosting',
        'growth-plan',
        'booking',
        'user-accounts',
        'admin-dashboard',
        'threed',
        'integrations',
        'cro-testing',
        'accessibility-audit',
        'reporting-export',
        'sla-uptime',
      ],
      clientType: 'smb',
      timeline: 'standard',
    },
  },
]);

export const MONOGRAM: BrochureInput = {
  slug: 'monogram',
  company: 'Monogram Custom Builders',
  strapline: 'Custom Homes & Pools',
  conceptUrl: 'https://monogram.bothmade.studio',
  currentUrl: 'https://www.monogramcustombuilders.com',
  city: 'Center Valley, Pennsylvania',

  // Read off the concept itself so the document and the site it is about are
  // the same object in two formats.
  theme: {
    paper: '#F4F1EA',
    paperDeep: '#E7E1D4',
    ink: '#131C26',
    bronze: '#A9793F',
    slate: '#3F6E7C',
    line: 'rgba(19, 28, 38, 0.14)',
  },

  cover: {
    eyebrow: 'A concept for',
    title: 'Monogram\nCustom Builders',
    standfirst:
      'We built a working homepage for Monogram before asking for anything. This document walks through what it does, why each part of it is there, and exactly what it would cost to make it yours — in three versions, with every technical word explained.',
  },

  chapters: [
    {
      section: {
        eyebrow: 'What this is',
        title: 'Not a pitch deck. A site that already exists.',
        body:
          'Everything in this brochure is a photograph of something live. You can open it on your phone right now, tap the buttons, and read the words. Nothing here is a mock-up of a thing we might build — it is the thing, waiting for your sign-off to become yours.',
      },
      shots: [
        {
          src: `${SHOTS}/divisions.jpg`,
          width: 1320,
          height: 2373,
          alt: 'The Monogram concept homepage, showing the Custom Homes and Custom Pools divisions',
          caption: 'The homepage. Two divisions, one company — the split every visitor needs in the first second.',
        },
      ],
      facts: [
        { label: 'Live at', value: 'monogram.bothmade.studio' },
        { label: 'Built for', value: 'Phone first, then desktop' },
        { label: 'Cost so far', value: 'Nothing' },
      ],
    },

    {
      section: {
        eyebrow: 'The first three seconds',
        title: 'A visitor decides before they read a word.',
        body:
          'Someone landing on a builder\'s site is answering one question: are these people serious? So the top of the page carries the two things that answer it — how long you have been doing this, and how much of it you have done — before any menu, any form, any sales language.',
      },
      shots: [
        {
          src: `${SHOTS}/homes.jpg`,
          width: 1320,
          height: 2422,
          alt: 'Division 01, Home Building, on the Monogram concept',
          caption:
            'Division 01. New construction on your lot or in one of your communities, plus additions and commercial work.',
        },
        {
          src: `${SHOTS}/pools.jpg`,
          width: 1320,
          height: 2525,
          alt: 'Division 02, Pool Building, on the Monogram concept',
          caption:
            'Division 02. Award-winning 3D pool design, engineered for minimal maintenance — gunite, reinforced, finished to last decades.',
        },
      ],
      facts: [
        { label: 'Above the fold', value: 'Founded 1994 · 1,500+ projects' },
        { label: 'Always on screen', value: 'Call · Start a project' },
      ],
    },

    {
      section: {
        eyebrow: 'The people',
        title: 'The founders are the differentiator, so they go near the top.',
        body:
          'Two partners who met at Lehigh and have stayed personally close to the work for thirty years is not a detail — for a client about to spend six or seven figures it is the whole decision. A national builder cannot say it. The site says it early, in your own words.',
      },
      shots: [
        {
          src: `${SHOTS}/founders.jpg`,
          width: 1320,
          height: 2071,
          alt: 'Tony Caciolo and Chip Shupe on the Monogram concept',
          caption:
            'Tony Caciolo and Chip Shupe. Best friends since Lehigh University, business partners since 1994.',
        },
      ],
      quote: {
        text: 'Signed in the spirit of friendliness and neighborliness.',
        attribution: 'The closing line of every Monogram building contract',
      },
    },

    {
      section: {
        eyebrow: 'The proof',
        title: 'One accountable team, stated as a fact rather than a promise.',
        body:
          'Survey and engineering, permits and inspections, trades and aftercare — three rows, each one marked "Managed". It is the plainest way to say the thing that separates you from a general contractor who subcontracts the parts that go wrong.',
      },
      shots: [
        {
          src: `${SHOTS}/partnership.jpg`,
          width: 1320,
          height: 2041,
          alt: 'The partnership and one-accountable-team sections of the Monogram concept',
          caption: 'Thirty years, 1,500+ completed projects, and in-house service after handover.',
        },
      ],
      facts: [
        { label: 'Founded', value: '1994' },
        { label: 'Completed projects', value: '1,500+' },
        { label: 'Ownership', value: 'Still local' },
      ],
    },

    {
      section: {
        eyebrow: 'The awards',
        title: 'Fifty-plus awards belong on a page, not in a paragraph.',
        body:
          'Listed the way an industry list is actually read — the award, where it applies, and who gave it. A visitor scanning this for four seconds still comes away knowing you are ranked nationally and first in the state.',
      },
      shots: [
        {
          src: `${SHOTS}/awards.jpg`,
          width: 1320,
          height: 2530,
          alt: 'The awards and recognition section of the Monogram concept',
          caption:
            'Top 50 Swimming Pool Builders nationally. #1 In-Ground Pool Builder in Pennsylvania. Lehigh Valley\'s Best Builder, eight times.',
        },
      ],
    },

    {
      section: {
        eyebrow: 'The work',
        title: 'Projects carry the town they are in.',
        body:
          'Saucon Valley. Nazareth. A prospective client in one of those townships is looking for exactly one thing — evidence you have built near them. Naming the place does more work than naming the style.',
      },
      shots: [
        {
          src: `${SHOTS}/projects.jpg`,
          width: 1320,
          height: 2531,
          alt: 'Recent projects on the Monogram concept',
          caption: 'Selected work, each piece labelled by town and by type — home, pool, or both.',
        },
      ],
    },

    {
      section: {
        eyebrow: 'Where you build',
        title: 'Thirty years in one valley, turned into a page.',
        body:
          'Knowing the townships, the inspectors, the soil and the rock is why your schedules hold. On the site it becomes something a visitor can act on: a list of the places you work and a button to check their own.',
      },
      shots: [
        {
          src: `${SHOTS}/service-area.jpg`,
          width: 1320,
          height: 2376,
          alt: 'The service area section of the Monogram concept',
          caption: '"That is not a marketing line — it is why our schedules hold."',
        },
        {
          src: `${SHOTS}/townships.jpg`,
          width: 1320,
          height: 1928,
          alt: 'The township list on the Monogram concept',
          caption:
            'Allentown, Bethlehem, Nazareth, Quakertown, Saucon Valley, Center Valley, Emmaus, Coopersburg.',
        },
      ],
    },

    {
      section: {
        eyebrow: 'The enquiry',
        title: 'One question, asked before anything else.',
        body:
          'A home, a pool, or both together. That single answer decides which of your two divisions picks the enquiry up, what gets asked next, and who calls back — and the visitor gave it away in one tap, before filling in a single box.',
      },
      shots: [
        {
          src: `${SHOTS}/start-here.jpg`,
          width: 1320,
          height: 2492,
          alt: 'The start-here enquiry section of the Monogram concept',
          caption:
            'The phone number stays a button, for the people who were only ever going to ring.',
        },
      ],
      facts: [
        { label: 'Sorts by', value: 'Home · Pool · Both' },
        { label: 'Also offers', value: 'Call now, or request a consultation' },
      ],
    },
  ],

  tiers,

  customItems: [
    {
      label: 'The pool visualiser',
      what:
        'An interactive 3D pool the visitor can turn, resize and change the finish of, in the browser, before speaking to anyone.',
      why:
        'Award-winning 3D pool design is already one of the first things the concept says about Division 02. Today that design happens after someone has committed to a meeting. Putting a version of it on the site moves the best thing you do to the front of the process instead of the middle.',
      builtFrom: ['threed'],
      includedIn: 'complete',
    },
    {
      label: 'The build portal',
      what:
        'A private login where a client under construction sees their own photos, dates, selections and invoices.',
      why:
        'A custom home runs for months. If owners are fielding "where are we up to?" calls, this is where those go — and it is the same screen your team already updates, rather than a second job for somebody.',
      builtFrom: ['user-accounts', 'admin-dashboard'],
      includedIn: 'complete',
    },
    {
      label: 'The township checker',
      what:
        'A visitor types their town and the site tells them straight away whether you build there, and what the local permit picture looks like.',
      why:
        'The service-area page already lists eight townships. This turns that list from something to read into something that answers a question — and it quietly filters out enquiries from outside the valley before they reach the office.',
      builtFrom: ['integrations'],
      includedIn: 'complete',
    },
    {
      label: 'The consultation router',
      what:
        'The home / pool / both answer sends the enquiry to the right division automatically, with a calendar attached so the visitor can pick a time themselves.',
      why:
        'Two divisions means every enquiry has a right person and a wrong person. This decides which at the moment the visitor taps, rather than the next morning.',
      builtFrom: ['booking', 'crm-setup'],
      includedIn: 'complete',
    },
  ],

  nextSteps: [
    'You look at the concept on your own phone, at monogram.bothmade.studio, and tell us what is wrong with it. That part is free and there is no version of this where we mind.',
    'We meet for half an hour — in person or on a call — and go through which of the three versions actually fits what you want the site to do this year.',
    'We send a contract with the version you picked written out in full, line by line, at the price on that page. Nothing in it is a surprise from this document.',
    'You pay the first of three payments and we start. Design approval triggers the second, and the third is due only when the site is ready to go live.',
    'Launch. Your team can edit the words and photos themselves from day one — that is what the content management system on every tier is for.',
  ],

  pricingNotes: [
    'Everything\u2019s Growth Plan is the Maintenance Plan with a batch of monthly improvements on top, so it replaces it rather than sitting alongside it \u2014 which is why Maintenance is not ticked in that column. Nothing is lost by moving up.',
  ],

  // Their line, not ours. It closes every contract they write; it can close
  // this too.
  signOff: 'Signed in the spirit of friendliness and neighborliness.',

  // No comparison pages. Nobody has been through monogramcustombuilders.com
  // properly, and a brochure that guesses at what is wrong with a prospect's
  // site is one sentence away from being wrong in front of them.
};
