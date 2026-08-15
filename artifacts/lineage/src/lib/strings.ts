/**
 * User-facing copy, held in one place.
 *
 * This is not a translation layer - the app ships in English only. It is the
 * structural prerequisite for one: strings live outside the components that
 * render them, keyed by meaning rather than by position, so introducing Urdu
 * later means adding a second object and a locale switch rather than hunting
 * literals through JSX.
 *
 * Right-to-left support will additionally need directional layout review;
 * keeping copy out of logic components is the part that is expensive to
 * retrofit, so it is done now.
 */
export const strings = {
  product: {
    name: "Lineage",
    tagline:
      "We don't want AI to decide what people should believe. We want it to show them how information got there.",
    motto: "Trace, don't judge.",
    footerNote: "Empowering judgment, not dictating truth.",
  },

  auth: {
    signIn: "Sign in with Google",
    signOut: "Sign out",
    signingIn: "Signing in…",
    checking: "Checking your session…",
    requiredTitle: "Sign in to use the workspace",
    requiredBody:
      "Tracing is free, but signing in lets us save your analyses so you can reopen them later. Everything public — how it works, the philosophy, and the investigation library — stays open without an account.",
    notConfiguredTitle: "Sign-in is not configured on this deployment",
    notConfiguredBody:
      "This build has no Firebase project attached, so accounts and saved history are unavailable. Everything else works — you can still trace claims, you just will not be able to save them.",
    errorNotConfigured: "Sign-in is not configured on this deployment yet.",
    errorPopupBlocked:
      "Your browser blocked the sign-in popup. Allow popups for this site and try again.",
    errorNetwork:
      "We couldn't reach the sign-in service. Check your connection and try again.",
    errorUnauthorizedDomain:
      "This domain is not authorised in the Firebase project. Add it under Authentication → Settings → Authorized domains.",
    errorGeneric: "We couldn't complete sign-in. Please try again.",
    errorSignOut: "We couldn't sign you out. Please try again.",
  },

  trace: {
    heading: "Trace a claim",
    inputLabel: "1. Provide the claim",
    inputPlaceholder: "Paste the message, post, or forward you want traced…",
    inputHelp:
      "Paste text, or upload a screenshot and we'll read the text from it. Up to 5000 characters.",
    upload: "Upload screenshot",
    submit: "Trace origin",
    submitting: "Tracing…",
    stageReading: "Reading the claim…",
    stageUnderstanding: "Working out what was actually said…",
    stageLooking: "Looking for an evidence-backed lineage…",
    stagePreparing: "Preparing the evidence…",
    knowledgeHeading: "What LINEAGE knows",
    coveragePrefix: "We found evidence for",
    coverageSuffix: "investigation stages.",
    lineageEstablished: "Lineage established",
    lineageCandidate: "Lineage candidate",
    lineageIncomplete: "Lineage not fully established",
    lineageNotEstablished: "Lineage not established",
    untracedWithWebLeads:
      "We found relevant web leads, but could not establish a reliable lineage from the available evidence.",
    tracedWithIncompleteEvidence:
      "A documented record matches this claim, but a source-linked path for every step was not established.",
    lineageEstablishedSummary:
      "The claim is connected to a documented origin and each recorded change is backed by linked evidence.",
    understoodHeading: "What we understood the claim to be",
    investigationHeading: "Investigation status",
    foundHeading: "What we found",
    notFoundHeading: "What we did not find",
    liveSearchHeading: "Current web leads",
    liveSearchSubtitle:
      "These links came from a live web search. They are starting points to inspect, not an automated fact-check.",
    liveSearchQuery: "Search wording",
    liveSearchNoResults:
      "The live search returned no links for this wording. That is not evidence that the claim is false.",
    liveSearchOpen: "Open web lead",
    liveSearchPublished: "Published",
    uncertaintyHeading: "What remains uncertain",
    chainHeading: "What changed",
    chainSubtitle:
      "From the documented origin through the last evidence-backed version in this record.",
    chainEnd: "This is the last version documented in this record.",
    // The signature visual: the whole journey as one horizontal rail, readable
    // at a glance and screenshot-able in a single frame.
    mapHeading: "Curated evidence relationships",
    mapSubtitle:
      "Only explicitly authored relationships are connected. Dashed related-evidence links document independent strands and do not claim source-to-source transmission or a path to your submission.",
    mapSubtitlePartial:
      "Each block is one step the claim above took. Left is where it started; right is the version in our records — not confirmed to be yours.",
    // Deliberately not just "Origin": the first chain node is also an origin
    // of sorts, and this node is specifically the investigated account.
    mapOriginBadge: "What actually happened",
    mapScrollHint: "Scroll sideways to follow the whole chain.",
    mapSelectHint:
      "Select a node to reveal its source, date, change, and evidence.",
    runtimeMapHeading: "Live provenance relationships",
    runtimeMapSubtitle:
      "Established, candidate, and insufficient relationships are shown differently. Every established arrow must carry source passages supporting that connection.",
    mapStepLabel: "Step",
    // Used when the claim could not be confidently connected. The chain below
    // belongs to the candidate record, not demonstrably to what the user
    // submitted, and the copy must not assert otherwise.
    chainHeadingPartial: "What changed in the claim we found",
    chainSubtitlePartial:
      "This is the lineage of the similar claim above — not confirmed to be the message you submitted. Read it to decide whether it is the same claim.",
    chainEndPartial:
      "If this is not the claim you were sent, we have no record of yours.",
    candidateHeading: "The closest claim we have on record",
    originHeading: "Origin",
    signalsHeading: "Investigation signals",
    signalsSubtitle:
      "These are prompts for what to look into — not scores of how true the claim is.",
    replyHeading: "If you want to reply to whoever sent this",
    selfCheckHeading: "What you can check yourself",
    selfCheckSubtitle:
      "These steps are chosen for the kind of distortion involved here.",
    lessonLabel: "Take this with you:",
    apiUnavailable:
      "We couldn't reach the tracing service. It may be starting up — wait a moment and try again.",
  },

  status: {
    TRACED: {
      label: "Traced",
      summary:
        "We connected this to a documented lineage. The chain below shows how the information changed on its way to you.",
    },
    PARTIALLY_TRACED: {
      label: "Partially traced",
      summary:
        "We found something related, but not closely enough to say they are the same claim. Treat what follows as a lead to check, not an answer.",
    },
    UNTRACED: {
      label: "Untraced",
      summary:
        "We couldn't establish a reliable lineage for this claim. That is a statement about our records, not about whether the claim is true.",
    },
  },

  history: {
    heading: "Your analyses",
    subtitle:
      "Traces you have run while signed in. Only you can see these — the server checks ownership on every request.",
    empty: "You have not traced anything yet.",
    emptyCta: "Trace your first claim",
    open: "Open",
    delete: "Delete",
    deleting: "Deleting…",
    confirmDelete: "Delete this analysis? This cannot be undone.",
    deleteFailed: "We couldn't delete that analysis. Please try again.",
    loadFailed:
      "We couldn't load your history. Your current result is unaffected.",
    unavailable:
      "History is not available on this deployment, so analyses are not being saved.",
  },

  claims: {
    heading: "Investigation library",
    subtitle:
      "Two externally verified cases sit alongside fifteen illustrative teaching records. An illustrative origin and lineage are not established evidence.",
    verified: "verified case",
    illustrative: "illustrative",
    verifiedNote: "Corroborated by named outside sources.",
    illustrativeNote:
      "Constructed by the project team to demonstrate a realistic mutation pattern. Not an independent investigation.",
    loading: "Loading the library…",
    loadFailed:
      "We couldn't load the lineage library. Check that the API server is running.",
  },

  nav: {
    trace: "Trace",
    claims: "Examples",
    howItWorks: "How it works",
    whyLineage: "Why Lineage",
    about: "About",
    history: "History",
  },
} as const;

export type Strings = typeof strings;
