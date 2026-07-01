import { ContestedRegistrySchema, type ContestedRegistry } from '@/domain/schema';

/**
 * CURATED CONTESTED-SYNTAX REGISTRY.
 *
 * Every id below was dumped from the REAL base parse data, never guessed
 * (see `scripts/dump-passage-syntax.mts`; validate with `npm run contested:check`):
 *   - GNT  : Nestle1904 LowFat (macula-greek). Bundled Philippians loads offline;
 *            Titus / Romans / 1 Timothy were dumped from the upstream macula trees.
 *   - WLC  : macula-hebrew LowFat (Genesis dumped from the upstream trees).
 *   - Samples: the bundled fixtures (`doc_sample_*`).
 *
 * `passageId` is the document id the loaders mint for a sentence, so an issue
 * attaches to exactly the passage the user is viewing. The base tree is the
 * DEFAULT; alternates are overlays — the base is never mutated.
 *
 * Copy is deliberately neutral (Phase 10): "the base tree shows", "this alternate
 * reads", never "wrong" / "correct" / "the true meaning".
 */

const MANUAL_LOW = { source: 'manual', confidence: 'low' } as const;

const RAW = {
  issues: [
    // ───────────────────────── John 1:14 (review) ─────────────────────────
    {
      id: 'iss_john_1_14_predicate',
      passageId: 'doc_sample_john_1_14a',
      verseRef: 'John 1:14',
      kind: 'subjectPredicate',
      sourceType: 'review-only',
      severity: 'review',
      label: 'Subject and predicate nominative (σὰρξ ἐγένετο ὁ λόγος)',
      shortLabel: 'Subject / predicate',
      summary:
        'The base tree marks ὁ λόγος as the subject and σάρξ as the predicate nominative of ἐγένετο. The same construction underlies the much-discussed θεὸς ἦν ὁ λόγος in John 1:1c, where an anarthrous predicate nominative precedes the verb.',
      pastoralNote:
        'A good place to teach how Greek marks subject vs. predicate by case and article rather than by word order.',
      affectedTokenIds: ['t3', 't4', 't5'],
      affectedNodeIds: ['n_logos', 'n_sarx', 'n_egeneto'],
      affectedRelationIds: ['r2', 'r4'],
      defaultReading: {
        label: 'λόγος = subject, σάρξ = predicate nominative',
        description:
          'ὁ λόγος (articular) is the subject; σάρξ (anarthrous) is the predicate nominative completing ἐγένετο.',
        parseSummary: 'subject ← λόγος · predicate nominative ← σάρξ',
      },
      alternateReadingIds: [],
      bibliography: ['Wallace, Greek Grammar Beyond the Basics, “Colwell’s Rule”.'],
    },

    // ─────────────────── 1 John 1:1 (syntax — relative chain) ───────────────────
    {
      id: 'iss_1john_1_1_relative_chain',
      passageId: 'doc_sample_1john_1_1',
      verseRef: '1 John 1:1',
      kind: 'clauseBoundary',
      sourceType: 'syntax-only',
      severity: 'review',
      label: 'Grouping of the ὅ … ὅ … ὅ relative clauses',
      shortLabel: 'Relative clauses',
      summary:
        'The base tree hangs the three ὅ-clauses (ὃ ἦν…, ὃ ἀκηκόαμεν…, ὃ ἑωράκαμεν…) in parallel beneath the head. An alternate reads them as a single coordinated chain, the second and third coordinating with the first.',
      affectedTokenIds: ['t1', 't5', 't7'],
      affectedNodeIds: ['n_rc1', 'n_rc2', 'n_rc3'],
      affectedRelationIds: ['r1', 'r2', 'r3'],
      defaultReading: {
        label: 'Three parallel relative clauses',
        description: 'Each ὅ-clause attaches independently to the (implied) head.',
        parseSummary: 'rc1 ∥ rc2 ∥ rc3 — all adjectival to the head',
      },
      alternateReadingIds: ['alt_1john_1_1_chain'],
    },

    // ─────────────────── Philippians 1:1 (syntax — attachment) ───────────────────
    {
      id: 'iss_phil_1_1_syn',
      passageId: 'gnt_philippians_0',
      verseRef: 'Philippians 1:1',
      kind: 'attachment',
      sourceType: 'syntax-only',
      severity: 'note',
      label: 'Attachment of σὺν ἐπισκόποις καὶ διακόνοις',
      shortLabel: 'σὺν-phrase',
      summary:
        'The base tree attaches “with overseers and deacons” to the participle οὖσιν (the saints who are at Philippi). An alternate attaches it to ἁγίοις, listing the overseers and deacons as co-addressees of the greeting.',
      affectedTokenIds: [
        't_500010010170010',
        't_500010010180010',
        't_500010010200010',
        't_500010010090010',
        't_500010010140010',
      ],
      affectedNodeIds: ['w_500010010170010', 'w_500010010090010', 'w_500010010140010'],
      affectedRelationIds: ['r_s0_17'],
      defaultReading: {
        label: 'Attaches to οὖσιν',
        description: 'The σὺν-phrase modifies the participle οὖσιν (“being… with…”).',
        parseSummary: 'οὖσιν → σύν (adverbial)',
      },
      alternateReadingIds: ['alt_phil_1_1_to_saints'],
    },

    // ─────────────────── Philippians 2:6 (semantic — ἁρπαγμός) ───────────────────
    {
      id: 'iss_phil_2_6_harpagmos',
      passageId: 'gnt_philippians_19',
      verseRef: 'Philippians 2:6',
      kind: 'semantic',
      sourceType: 'semantic-only',
      severity: 'major',
      label: 'Sense of ἁρπαγμόν',
      shortLabel: 'ἁρπαγμός',
      summary:
        'The tree is not in question: ἁρπαγμόν is the object complement of ἡγήσατο, with “equality with God” as its object. The debated point is the SENSE of ἁρπαγμός in the idiom — a prize still to be seized, or something already held and not exploited.',
      affectedTokenIds: ['t_500020060070010'],
      affectedNodeIds: ['w_500020060070010'],
      affectedRelationIds: ['r_s19_20'],
      defaultReading: {
        label: 'ἁρπαγμόν as object complement',
        description:
          'ἡγήσατο takes “to be equal with God” as object and ἁρπαγμόν as its complement; the structure does not decide the sense.',
        parseSummary: 'ἡγήσατο → ἁρπαγμόν (object complement)',
      },
      alternateReadingIds: ['alt_phil_2_6_rapienda', 'alt_phil_2_6_rapta'],
      bibliography: ['Hoover, “The Harpagmos Enigma”, HTR 64 (1971).'],
    },

    // ─────────────── Philippians 3:9 (semantic — πίστις Χριστοῦ) ───────────────
    {
      id: 'iss_phil_3_9_pistis_christou',
      passageId: 'gnt_philippians_43',
      verseRef: 'Philippians 3:9',
      kind: 'genitive',
      sourceType: 'semantic-only',
      severity: 'major',
      label: 'πίστεως Χριστοῦ — objective or subjective genitive',
      shortLabel: 'πίστις Χριστοῦ',
      summary:
        'The base tree marks Χριστοῦ as a genitive dependent of πίστεως. The same tree supports more than one construal: faith DIRECTED TOWARD Christ (objective), the faithfulness OF Christ (subjective), or a broader/plenary sense.',
      affectedTokenIds: ['t_500030090150010', 't_500030090160010'],
      affectedRelationIds: ['r_s43_36'],
      defaultReading: {
        label: 'Genitive (unspecified force)',
        description: 'Χριστοῦ is a genitive modifier of πίστεως; the base does not fix its semantic force.',
        parseSummary: 'πίστεως → Χριστοῦ (genitive)',
      },
      alternateReadingIds: [
        'alt_phil_3_9_objective',
        'alt_phil_3_9_subjective',
        'alt_phil_3_9_plenary',
      ],
    },

    // ─────────────────── Titus 2:13 (syntax — coordination) ───────────────────
    {
      id: 'iss_titus_2_13_granville',
      passageId: 'gnt_titus_17',
      verseRef: 'Titus 2:13',
      kind: 'coordination',
      sourceType: 'syntax-only',
      severity: 'major',
      label: '“our great God and Savior Jesus Christ” — one referent or two',
      shortLabel: 'God and Savior',
      summary:
        'The base tree groups Σωτῆρος as a conjunct of Θεοῦ and places Χριστοῦ Ἰησοῦ in apposition to Θεοῦ — one referent (“our great God and Savior, [namely] Jesus Christ”). An alternate attaches Χριστοῦ Ἰησοῦ and ἡμῶν to Σωτῆρος instead — two referents (“the great God, and our Savior Jesus Christ”).',
      affectedTokenIds: [
        't_560020130100010',
        't_560020130110010',
        't_560020130120010',
        't_560020130130010',
        't_560020130140010',
        't_560020130150010',
        't_560020130160010',
      ],
      affectedNodeIds: [
        'w_560020130110010',
        'w_560020130130010',
        'w_560020130150010',
      ],
      affectedRelationIds: ['r_s17_33', 'r_s17_35', 'r_s17_38'],
      defaultReading: {
        label: 'One referent (Granville Sharp)',
        description: 'Χριστοῦ Ἰησοῦ stands in apposition to Θεοῦ; God and Savior both describe Jesus Christ.',
        parseSummary: 'Θεοῦ ←(apposition) Χριστοῦ Ἰησοῦ',
      },
      alternateReadingIds: ['alt_titus_2_13_two_referents'],
      bibliography: ['Wallace, Greek Grammar Beyond the Basics, “Granville Sharp Rule”.'],
    },

    // ─────────────── Matthew 4:3 (syntax — commanded ἵνα-clause) ───────────────
    {
      id: 'iss_matt_4_3_command',
      passageId: 'gnt_matthew_48',
      verseRef: 'Matthew 4:3',
      kind: 'clauseBoundary',
      sourceType: 'syntax-only',
      severity: 'note',
      label: 'εἰπὲ ἵνα … — coordinate clauses or a commanded content clause',
      shortLabel: 'εἰπὲ ἵνα',
      summary:
        'The base (macula) tree coordinates the tempter’s words as flat sibling clauses joined by καί (“… εἶ … εἰπὲ … γένωνται”), with the demonstrative οὗτοι in apposition to οἱ λίθοι. A common school-grammar analysis instead reads the ἵνα-clause as the CONTENT of the command — the object of εἰπὲ, drawn on a pedestal — and takes οὗτοι as an adjectival demonstrative modifying λίθοι.',
      pastoralNote:
        'The sense is the same either way (“tell these stones to become bread”); the difference is only how the command and its content clause are diagrammed.',
      affectedTokenIds: [
        't_400040030120010', // εἰπὲ
        't_400040030150010', // λίθοι
        't_400040030160010', // οὗτοι
        't_400040030180010', // γένωνται
      ],
      affectedNodeIds: ['cl_400040030140050', 'w_400040030120010', 'w_400040030160010'],
      affectedRelationIds: ['r_s48_19', 'r_s48_16'],
      defaultReading: {
        label: 'Flat coordination; οὗτοι in apposition',
        description:
          'The clauses are coordinate siblings under one καί-joined head; the demonstrative οὗτοι stands in apposition to οἱ λίθοι.',
        parseSummary: 'εἶ ∥ εἰπὲ ∥ γένωνται · λίθοι ←(apposition) οὗτοι',
      },
      alternateReadingIds: ['alt_matt_4_3_command'],
      bibliography: ['Standard school-grammar treatment (e.g. Accordance Syntax).'],
    },

    // ─────────────── Romans 9:5 (cross-boundary — doxology) ───────────────
    // The reading crosses the base SENTENCE boundary: macula sets the doxology
    // (ὁ ὢν ἐπὶ πάντων θεός…, sentence 229) apart from the relative clause that
    // ends “…ὁ Χριστὸς τὸ κατὰ σάρκα” (sentence 228). So this issue MERGES the two
    // sentences and authors its ids/overlay against the combined document (whose
    // ids are `s0_…` for 9:3–5 and `s1_…` for the doxology, joined by `disc_rN`).
    {
      id: 'iss_rom_9_5_doxology',
      passageId: 'gnt_romans_228',
      mergePassageIds: ['gnt_romans_228', 'gnt_romans_229'],
      verseRef: 'Romans 9:5',
      kind: 'clauseBoundary',
      sourceType: 'syntax-only',
      severity: 'major',
      label: 'ὁ ὢν ἐπὶ πάντων θεός — doxology or description of Christ',
      shortLabel: 'Doxology',
      summary:
        'The base data sets ὁ ὢν ἐπὶ πάντων θεὸς εὐλογητός as its OWN sentence — an independent doxology to God. An alternate punctuation reads it in apposition to ὁ Χριστός at the end of the previous clause (“Christ, who is over all, God blessed forever”). Because the two readings differ at the SENTENCE boundary, the two sentences are shown merged so the alternate can attach the doxology to Christ structurally rather than as a footnote.',
      pastoralNote:
        'The punctuation choice carries real Christological weight: whether Paul here calls the Messiah “God over all, blessed forever,” or breaks into a separate doxology to the Father.',
      affectedTokenIds: [
        's0_t_450090050080010', // Χριστὸς (end of the 9:3–5 sentence)
        's1_t_450090050130010', // ὢν
        's1_t_450090050160010', // Θεὸς
        's1_t_450090050170010', // εὐλογητὸς
      ],
      affectedNodeIds: [
        's0_w_450090050080010', // Χριστὸς
        's1_cl_450090050120100', // the doxology clause
        's1_w_450090050160010', // Θεὸς
      ],
      affectedRelationIds: ['disc_r1'],
      defaultReading: {
        label: 'Independent doxology (to God)',
        description:
          'The doxology stands as its own sentence — a blessing of God “who is over all”, set apart from the description of Christ.',
        parseSummary: 'separate sentence · Θεός = subject of the blessing',
      },
      alternateReadingIds: ['alt_rom_9_5_to_christ'],
      bibliography: ['Metzger, Textual Commentary, Romans 9:5.'],
    },

    // ─────────────────── Genesis 1:1 (syntax — Hebrew) ───────────────────
    {
      id: 'iss_gen_1_1_construct',
      passageId: 'wlc_genesis_1_0',
      verseRef: 'Genesis 1:1',
      kind: 'clauseBoundary',
      sourceType: 'syntax-only',
      severity: 'major',
      label: 'בְּרֵאשִׁית — absolute or construct',
      shortLabel: 'בְּרֵאשִׁית',
      summary:
        'The base tree reads v.1 as an independent clause: “In the beginning God created the heavens and the earth,” with בְּרֵאשִׁית a temporal adjunct. An alternate reads בְּרֵאשִׁית as a construct governing the verb — “When God began to create…” — making v.1 a dependent temporal clause.',
      affectedTokenIds: [
        't_o010010010011',
        't_o010010010012',
        't_o010010010021',
        't_o010010010031',
      ],
      affectedNodeIds: ['cl_h0_0', 'w_o010010010012', 'w_o010010010021'],
      affectedRelationIds: ['r_h0_1', 'r_h0_3'],
      defaultReading: {
        label: 'Absolute (“In the beginning, God created…”)',
        description: 'v.1 is a complete independent clause; בְּרֵאשִׁית is a temporal adjunct.',
        parseSummary: 'independent clause · בָּרָא = main verb',
      },
      alternateReadingIds: ['alt_gen_1_1_construct'],
      bibliography: ['Rashi on Genesis 1:1; NJPS / NRSV margins.'],
    },

    // ─────────────────── 1 Timothy 3:16 (textual variant) ───────────────────
    {
      id: 'iss_1tim_3_16_variant',
      passageId: 'gnt_1-timothy_34',
      verseRef: '1 Timothy 3:16',
      kind: 'textual',
      sourceType: 'textual-variant',
      severity: 'major',
      label: 'ὅς / θεός / ὅ — “who / God / which” was manifested',
      shortLabel: 'ὅς / θεός',
      summary:
        'The base text reads the relative ὅς (“who was manifested in flesh”). Other witnesses read θεός (“God was manifested…”, Byzantine/TR) or the neuter ὅ (agreeing with μυστήριον). This is a textual variant — a different wording — so it is NOT merged into the base tokens.',
      affectedTokenIds: ['t_540030160090010'],
      affectedNodeIds: ['w_540030160090010'],
      defaultReading: {
        label: 'ὅς (“who”)',
        description: 'The base reads the masculine relative pronoun ὅς, taking the hymn’s antecedent as personal (Christ).',
        parseSummary: 'subject of ἐφανερώθη ← ὅς',
      },
      alternateReadingIds: ['alt_1tim_3_16_theos', 'alt_1tim_3_16_neuter'],
      bibliography: ['Metzger, Textual Commentary, 1 Timothy 3:16.'],
    },

    // ─────────────── Romans 3:22 (semantic — πίστις Χριστοῦ) ───────────────
    {
      id: 'iss_rom_3_22_pistis_christou',
      passageId: 'gnt_romans_65',
      verseRef: 'Romans 3:22',
      kind: 'genitive',
      sourceType: 'semantic-only',
      severity: 'major',
      label: 'πίστεως Ἰησοῦ Χριστοῦ — objective or subjective genitive',
      shortLabel: 'πίστις Χριστοῦ',
      summary:
        'The base tree marks Ἰησοῦ Χριστοῦ as a genitive dependent of πίστεως. The same tree supports more than one construal: faith DIRECTED TOWARD Christ (objective), the faithfulness OF Christ (subjective), or a broader/plenary sense.',
      affectedTokenIds: ['t_450030220050010', 't_450030220060010', 't_450030220070010'],
      affectedRelationIds: ['r_s65_18'],
      defaultReading: {
        label: 'Genitive (unspecified force)',
        description:
          'Ἰησοῦ Χριστοῦ is a genitive modifier of πίστεως; the base does not fix its semantic force.',
        parseSummary: 'πίστεως → Ἰησοῦ Χριστοῦ (genitive)',
      },
      alternateReadingIds: [
        'alt_rom_3_22_objective',
        'alt_rom_3_22_subjective',
        'alt_rom_3_22_plenary',
      ],
      notes: 'Part of the wider πίστις Χριστοῦ cluster (cf. Galatians 2:16; Philippians 3:9).',
    },

    // ─────────────── Galatians 2:16 (semantic — πίστις Χριστοῦ) ───────────────
    {
      id: 'iss_gal_2_16_pistis_christou',
      passageId: 'gnt_galatians_28',
      verseRef: 'Galatians 2:16',
      kind: 'genitive',
      sourceType: 'semantic-only',
      severity: 'major',
      label: 'πίστεως Χριστοῦ — objective or subjective genitive',
      shortLabel: 'πίστις Χριστοῦ',
      summary:
        'Galatians 2:16 carries the genitive twice (διὰ πίστεως Χριστοῦ Ἰησοῦ … ἐκ πίστεως Χριστοῦ). The base marks Χριστοῦ as a genitive of πίστεως in both; the construal is debated — faith IN Christ (objective) or the faithfulness OF Christ (subjective).',
      affectedTokenIds: [
        't_480020160130010',
        't_480020160140010',
        't_480020160250010',
        't_480020160260010',
      ],
      affectedRelationIds: ['r_s28_25', 'r_s28_39'],
      defaultReading: {
        label: 'Genitive (unspecified force)',
        description:
          'Χριστοῦ is a genitive modifier of πίστεως in both occurrences; the base does not fix its force.',
        parseSummary: 'πίστεως → Χριστοῦ (genitive)',
      },
      alternateReadingIds: ['alt_gal_2_16_objective', 'alt_gal_2_16_subjective'],
      bibliography: ['Wallace, Greek Grammar Beyond the Basics, “πίστις Χριστοῦ”.'],
    },

    // ─────────────── Colossians 1:15 (semantic — firstborn genitive) ───────────────
    {
      id: 'iss_col_1_15_firstborn',
      passageId: 'gnt_colossians_3',
      verseRef: 'Colossians 1:15',
      kind: 'genitive',
      sourceType: 'semantic-only',
      severity: 'major',
      label: 'πρωτότοκος πάσης κτίσεως — relation of the genitive',
      shortLabel: 'firstborn of creation',
      summary:
        'The base marks κτίσεως as a genitive of πρωτότοκος. Its relation is debated: a genitive of subordination (firstborn — first in rank — OVER all creation), or a partitive genitive (firstborn WITHIN creation, part of the created order).',
      affectedTokenIds: ['t_510010150080010', 't_510010150090010', 't_510010150100010'],
      affectedRelationIds: ['r_s3_116'],
      defaultReading: {
        label: 'Genitive (unspecified relation)',
        description:
          'κτίσεως is a genitive modifier of πρωτότοκος; the base does not fix whether it is partitive or a genitive of subordination.',
        parseSummary: 'πρωτότοκος → κτίσεως (genitive)',
      },
      alternateReadingIds: ['alt_col_1_15_supremacy', 'alt_col_1_15_partitive'],
      bibliography: ['Wallace, Greek Grammar Beyond the Basics, “Genitive of Subordination”.'],
    },

    // ─────────────── Colossians 2:18 (semantic — worship of angels) ───────────────
    {
      id: 'iss_col_2_18_angels',
      passageId: 'gnt_colossians_17',
      verseRef: 'Colossians 2:18',
      kind: 'genitive',
      sourceType: 'semantic-only',
      severity: 'review',
      label: 'θρησκείᾳ τῶν ἀγγέλων — objective or subjective genitive',
      shortLabel: 'worship of angels',
      summary:
        'The base marks ἀγγέλων as a genitive of θρησκείᾳ. Objective: worship DIRECTED TO angels; subjective: the angels’ OWN heavenly worship, which the visionary claims to join.',
      affectedTokenIds: ['t_510020180080010', 't_510020180090010', 't_510020180100010'],
      affectedRelationIds: ['r_s17_6'],
      defaultReading: {
        label: 'Genitive (unspecified force)',
        description:
          'ἀγγέλων is a genitive modifier of θρησκείᾳ; the base does not fix the direction of the worship.',
        parseSummary: 'θρησκείᾳ → ἀγγέλων (genitive)',
      },
      alternateReadingIds: ['alt_col_2_18_objective', 'alt_col_2_18_subjective'],
    },

    // ─────────────── Ephesians 2:8-9 (review — antecedent of τοῦτο) ───────────────
    {
      id: 'iss_eph_2_8_touto',
      passageId: 'gnt_ephesians_13',
      verseRef: 'Ephesians 2:8-9',
      kind: 'other',
      sourceType: 'review-only',
      severity: 'major',
      label: 'Antecedent of neuter τοῦτο (“and this is God’s gift”)',
      shortLabel: 'τοῦτο',
      summary:
        'The neuter demonstrative τοῦτο has no neuter noun beside it to agree with — χάρις (grace) and πίστις (faith) are both feminine. Its antecedent is therefore debated: faith, grace, or (most commonly) the whole “by grace … through faith” salvation event of the previous clause. The base does not resolve the referent.',
      pastoralNote:
        'A clear case where Greek gender rules out a tidy one-word antecedent and points to the whole preceding idea.',
      affectedTokenIds: ['t_490020080090010', 't_490020080150010'],
      affectedNodeIds: ['w_490020080090010'],
      defaultReading: {
        label: 'Refers to the whole salvation event',
        description:
          'The neuter τοῦτο looks back to the entire “by grace … through faith” clause rather than to a single feminine noun.',
        parseSummary: 'τοῦτο ← (salvation by grace through faith)',
      },
      alternateReadingIds: ['alt_eph_2_8_faith', 'alt_eph_2_8_grace'],
      bibliography: ['Mounce, “Antecedents and Faith (Eph 2:8-9)”.'],
    },

    // ─────────────── Acts 2:38 (semantic — force of εἰς) ───────────────
    {
      id: 'iss_acts_2_38_eis_aphesin',
      passageId: 'gnt_acts_46',
      verseRef: 'Acts 2:38',
      kind: 'semantic',
      sourceType: 'semantic-only',
      severity: 'major',
      label: 'εἰς ἄφεσιν τῶν ἁμαρτιῶν — force of εἰς',
      shortLabel: 'εἰς ἄφεσιν',
      summary:
        'The base hangs εἰς ἄφεσιν as an adverbial under βαπτισθήτω. The relation εἰς expresses is debated: purpose/result (“so as to receive forgiveness”) or reference/basis (“with reference to / on the basis of forgiveness”).',
      affectedTokenIds: ['t_440020380070010', 't_440020380150010', 't_440020380160010'],
      affectedRelationIds: ['r_s46_19', 'r_s46_18'],
      defaultReading: {
        label: 'Adverbial εἰς-phrase under βαπτισθήτω',
        description:
          'εἰς ἄφεσιν modifies βαπτισθήτω; the base does not fix whether εἰς is purpose/result or reference/basis.',
        parseSummary: 'βαπτισθήτω → εἰς ἄφεσιν (adverbial)',
      },
      alternateReadingIds: ['alt_acts_2_38_purpose', 'alt_acts_2_38_basis'],
    },

    // ───────────── 2 Corinthians 5:4 (syntax — Reed-Kellogg / Leedy) ─────────────
    {
      id: 'iss_2cor_5_4_leedy',
      passageId: 'gnt_2-corinthians_67',
      verseRef: '2 Corinthians 5:4',
      kind: 'clauseBoundary',
      sourceType: 'syntax-only',
      severity: 'review',
      label: 'Structure of the ἵνα clause and the οὐ … ἀλλά infinitives',
      shortLabel: 'ἵνα / οὐ…ἀλλά',
      summary:
        'The base (Nestle1904 LowFat) tree joins the ἵνα clause (καταποθῇ τὸ θνητόν …) to στενάζομεν under a top-level coordinate clause with γάρ as its coordinator, and treats ἐπενδύσασθαι as the head of the infinitive complex with ἐκδύσασθαι and οὐ in apposition. A Reed-Kellogg / Leedy diagram instead subordinates the ἵνα clause as a purpose clause under ἐπενδύσασθαι, reads οὐ … ἀλλά as coordinating two parallel infinitive objects of θέλομεν, takes γάρ as an introductory connective, and supplies the elided subject of θέλομεν as (X).',
      pastoralNote:
        'A useful place to show how an inferential γάρ, a purpose ἵνα, and a correlative οὐ … ἀλλά shape the flow: we groan not to be unclothed but further clothed, so that mortality is swallowed up by life.',
      affectedTokenIds: [
        't_470050040020010', // γάρ
        't_470050040120010', // οὐ
        't_470050040140010', // ἐκδύσασθαι
        't_470050040150010', // ἀλλ'
        't_470050040160010', // ἐπενδύσασθαι
        't_470050040180010', // καταποθῇ
      ],
      affectedNodeIds: [
        'cl_470050040020230', // top-level coordinate clause
        'cl_470050040180060', // ἵνα clause
        'w_470050040160010', // ἐπενδύσασθαι
        'w_470050040140010', // ἐκδύσασθαι
        'w_470050040120010', // οὐ
        'w_470050040150010', // ἀλλ'
        'w_470050040020010', // γάρ
      ],
      affectedRelationIds: [
        'r_s67_11',
        'r_s67_12',
        'r_s67_13',
        'r_s67_14',
        'r_s67_18',
        'r_s67_25',
        'r_s67_26',
      ],
      defaultReading: {
        label: 'ἵνα clause coordinate at the top level; ἐπενδύσασθαι as head',
        description:
          'The base tree joins the ἵνα clause to στενάζομεν under a top-level coordinate clause (coordinator γάρ); within θέλομεν, ἐπενδύσασθαι heads the infinitives with ἐκδύσασθαι and οὐ in apposition.',
        parseSummary: 'top: στενάζομεν ∥ καταποθῇ (γάρ) · θέλομεν → ἐπενδύσασθαι (≈ ἐκδύσασθαι, οὐ)',
      },
      alternateReadingIds: ['alt_2cor_5_4_leedy'],
      bibliography: [
        'Randy Leedy, “New Testament Greek Sentence Diagramming,” Biblical Viewpoint 39/1 (2005).',
      ],
    },

    // ═══════════════════ Major NT textual variants ═══════════════════
    // Each anchors to the ACTUAL Nestle1904 base word(s); the alternate wording is
    // shown as a textual variant and NEVER merged into the base token stream.

    // ───────────────────── Mark 1:41 (compassion / anger) ─────────────────────
    {
      id: 'iss_mark_1_41_variant',
      passageId: 'gnt_mark_38',
      verseRef: 'Mark 1:41',
      kind: 'textual',
      sourceType: 'textual-variant',
      severity: 'major',
      label: 'σπλαγχνισθεὶς / ὀργισθεὶς — “moved with compassion” or “with anger”',
      shortLabel: 'compassion / anger',
      summary:
        'The base reads σπλαγχνισθεὶς (“moved with compassion”), with the vast majority of witnesses. Codex Bezae (D) and part of the Old Latin read ὀργισθεὶς (“moved with anger/indignation”), which some editors prefer as the harder reading. A textual variant — a different wording — so it is not merged into the base tokens.',
      affectedTokenIds: ['t_410010410020010'],
      affectedNodeIds: ['w_410010410020010'],
      defaultReading: {
        label: 'σπλαγχνισθεὶς (“moved with compassion”)',
        description:
          'The base has the aorist participle σπλαγχνισθεὶς modifying ἥψατο — Jesus is moved with compassion as he touches the leper.',
        parseSummary: 'ἥψατο ← σπλαγχνισθεὶς (adverbial participle)',
      },
      alternateReadingIds: ['alt_mark_1_41_anger'],
      bibliography: ['Metzger, Textual Commentary, Mark 1:41; NET note on Mark 1:41.'],
    },

    // ───────────────────── John 1:18 (only God / only Son) ─────────────────────
    {
      id: 'iss_john_1_18_variant',
      passageId: 'gnt_john_16',
      verseRef: 'John 1:18',
      kind: 'textual',
      sourceType: 'textual-variant',
      severity: 'major',
      label: 'μονογενὴς θεός / ὁ μονογενὴς υἱός — “the only God” or “the only Son”',
      shortLabel: 'θεός / υἱός',
      summary:
        'The base reads μονογενὴς θεός (“[the] only-begotten God”), with the earliest witnesses (𝔓66 𝔓75 ℵ B C*). Many later manuscripts read ὁ μονογενὴς υἱός (“the only Son”). A major Christological variant: in the abbreviated nomina sacra only one letter (ΘΣ vs ΥΣ) separates the two. Shown as a textual variant; base tokens unchanged.',
      affectedTokenIds: ['t_430010180060010'],
      affectedNodeIds: ['w_430010180060010'],
      defaultReading: {
        label: 'μονογενὴς θεός (“the only God”)',
        description:
          'The base reads the anarthrous θεός with μονογενὴς — “the only-begotten God, who is in the bosom of the Father”.',
        parseSummary: 'subject μονογενὴς θεός → ἐξηγήσατο',
      },
      alternateReadingIds: ['alt_john_1_18_son'],
      bibliography: ['Metzger, Textual Commentary, John 1:18; NET note (“notoriously difficult”).'],
    },

    // ───────────────── Acts 20:28 (church of God / of the Lord) ─────────────────
    {
      id: 'iss_acts_20_28_variant',
      passageId: 'gnt_acts_647',
      verseRef: 'Acts 20:28',
      kind: 'textual',
      sourceType: 'textual-variant',
      severity: 'major',
      label: 'τὴν ἐκκλησίαν τοῦ θεοῦ / τοῦ κυρίου — “church of God” or “of the Lord”',
      shortLabel: 'θεοῦ / κυρίου',
      summary:
        'The base reads τὴν ἐκκλησίαν τοῦ θεοῦ (“the church of God”, ℵ B), which — with “his own blood” following — carries the striking implication of “God’s blood”. Other witnesses read τοῦ κυρίου (“of the Lord”, 𝔓74 A C D E), and later manuscripts conflate to “the Lord and God”. A textual variant; base tokens unchanged.',
      affectedTokenIds: ['t_440200280200010'],
      affectedNodeIds: ['w_440200280200010'],
      defaultReading: {
        label: 'τοῦ θεοῦ (“of God”)',
        description:
          'The base reads θεοῦ as the genitive head of ἐκκλησίαν — “the church of God, which he obtained with his own blood”.',
        parseSummary: 'ἐκκλησίαν → τοῦ θεοῦ (genitive)',
      },
      alternateReadingIds: ['alt_acts_20_28_lord', 'alt_acts_20_28_lord_and_god'],
      bibliography: ['Metzger, Textual Commentary, Acts 20:28; NET note on Acts 20:28.'],
    },

    // ───────────────── Romans 5:1 (let us have / we have peace) ─────────────────
    {
      id: 'iss_rom_5_1_variant',
      passageId: 'gnt_romans_101',
      verseRef: 'Romans 5:1',
      kind: 'textual',
      sourceType: 'textual-variant',
      severity: 'major',
      label: 'ἔχωμεν / ἔχομεν — “let us have peace” or “we have peace”',
      shortLabel: 'ἔχωμεν / ἔχομεν',
      summary:
        'The Nestle1904 base reads the subjunctive ἔχωμεν (“let us have peace”), an exhortation, with ℵ* A B* C D. Many witnesses read the indicative ἔχομεν (“we have peace”), a statement — a one-letter (ω/ο) difference. Most modern editors judge the indicative the likely original despite the weaker external support. A textual variant; base tokens unchanged.',
      affectedTokenIds: ['t_450050010060010'],
      affectedNodeIds: ['w_450050010060010'],
      defaultReading: {
        label: 'ἔχωμεν (subjunctive — “let us have peace”)',
        description:
          'The base reads the present subjunctive ἔχωμεν, making v.1 a hortatory “let us have peace with God”.',
        parseSummary: 'predicate ἔχωμεν (subjunctive)',
      },
      alternateReadingIds: ['alt_rom_5_1_indicative'],
      bibliography: ['Metzger, Textual Commentary, Romans 5:1; NET note on Romans 5:1.'],
    },

    // ───────────────── Luke 23:34 (forgiveness saying incl./omit) ─────────────────
    {
      id: 'iss_luke_23_34_inclusion',
      passageId: 'gnt_luke_1082',
      verseRef: 'Luke 23:34',
      kind: 'textual',
      sourceType: 'passage-inclusion',
      severity: 'major',
      label: '“Father, forgive them…” — included or omitted',
      shortLabel: 'forgiveness saying',
      summary:
        'The base includes Jesus’ prayer “Father, forgive them, for they do not know what they are doing.” Several early and weighty witnesses (𝔓75 ℵ* B D* W Θ) omit it, while many others include it (NA prints it in double brackets). The saying fits Lukan themes of enemy-forgiveness. This concerns the passage’s presence in the tradition; the base keeps the words.',
      affectedTokenIds: [
        't_420230340050010', // Πάτερ
        't_420230340060010', // ἄφες
        't_420230340070010', // αὐτοῖς
        't_420230340080010', // οὐ
        't_420230340090010', // γὰρ
        't_420230340100010', // οἴδασιν
        't_420230340110010', // τί
        't_420230340120010', // ποιοῦσιν
      ],
      defaultReading: {
        label: 'Included (base)',
        description: 'The base prints the prayer “Πάτερ, ἄφες αὐτοῖς, οὐ γὰρ οἴδασιν τί ποιοῦσιν”.',
        parseSummary: 'ἔλεγεν → [Πάτερ ἄφες αὐτοῖς …]',
      },
      alternateReadingIds: ['alt_luke_23_34_omit'],
      bibliography: ['Metzger, Textual Commentary, Luke 23:34; NET note on Luke 23:34.'],
    },

    // ───────────────── 1 Corinthians 13:3 (be burned / boast) ─────────────────
    {
      id: 'iss_1cor_13_3_variant',
      passageId: 'gnt_1-corinthians_376',
      verseRef: '1 Corinthians 13:3',
      kind: 'textual',
      sourceType: 'textual-variant',
      severity: 'major',
      label: 'καυθήσομαι / καυχήσωμαι — “that I may be burned” or “that I may boast”',
      shortLabel: 'burned / boast',
      summary:
        'The base reads ἵνα καυθήσομαι (“so that I may be burned”), with the Byzantine and many later witnesses. The earliest witnesses (𝔓46 ℵ A B) read καυχήσωμαι (“so that I may boast”) — a one-letter (θ/χ) difference that reverses the sense. A textual variant; base tokens unchanged.',
      affectedTokenIds: ['t_460130030150010'],
      affectedNodeIds: ['w_460130030150010'],
      defaultReading: {
        label: 'καυθήσομαι (“that I may be burned”)',
        description: 'The base reads the future καυθήσομαι — giving over the body “that I may be burned”.',
        parseSummary: 'ἵνα → καυθήσομαι',
      },
      alternateReadingIds: ['alt_1cor_13_3_boast'],
      bibliography: ['Metzger, Textual Commentary, 1 Corinthians 13:3; NET note on 1 Corinthians 13:3.'],
    },

    // ───────────────── Matthew 5:22 (“without cause” added?) ─────────────────
    {
      id: 'iss_matt_5_22_variant',
      passageId: 'gnt_matthew_99',
      verseRef: 'Matthew 5:22',
      kind: 'textual',
      sourceType: 'textual-variant',
      severity: 'major',
      label: 'ὀργιζόμενος (+ εἰκῇ?) — “angry with his brother” or “…without cause”',
      shortLabel: 'εἰκῇ (“without cause”)',
      summary:
        'The base reads “everyone who is angry with his brother” with no qualifier — the reading of the earliest witnesses (𝔓64vid ℵ* B). Many witnesses add εἰκῇ (“without cause”, ℵ² D L W Θ 𝔐), softening the saying to unjustified anger. A textual variant: the added adverb is not merged into the base tokens.',
      affectedTokenIds: ['t_400050220080010'],
      affectedNodeIds: ['w_400050220080010'],
      defaultReading: {
        label: 'without εἰκῇ (base)',
        description:
          'The base reads ὀργιζόμενος τῷ ἀδελφῷ αὐτοῦ with no qualifier — anger itself is liable to judgment.',
        parseSummary: 'ὀργιζόμενος → τῷ ἀδελφῷ (no εἰκῇ)',
      },
      alternateReadingIds: ['alt_matt_5_22_eike'],
      bibliography: ['Metzger, Textual Commentary, Matthew 5:22; NET note on Matthew 5:22.'],
    },
  ],

  readings: [
    // 1 John 1:1
    {
      id: 'alt_1john_1_1_chain',
      issueId: 'iss_1john_1_1_relative_chain',
      passageId: 'doc_sample_1john_1_1',
      label: 'Coordinated relative chain',
      shortLabel: 'Coordinate chain',
      interpretation: 'The three relatives form one coordinated series.',
      description:
        'The second and third ὅ-clauses coordinate with the first rather than each attaching independently to the head.',
      sourceType: 'syntax-only',
      confidence: 'medium',
      syntaxPatch: {
        relations: {
          update: {
            r2: { headId: 'n_rc1', type: 'conjunct' },
            r3: { headId: 'n_rc1', type: 'conjunct' },
          },
        },
      },
    },

    // Philippians 1:1
    {
      id: 'alt_phil_1_1_to_saints',
      issueId: 'iss_phil_1_1_syn',
      passageId: 'gnt_philippians_0',
      label: 'Attaches to ἁγίοις (co-addressees)',
      shortLabel: 'to the saints',
      interpretation: 'Overseers and deacons are addressed alongside the saints.',
      description:
        'The σὺν-phrase modifies ἁγίοις — the letter is to the saints, together with the overseers and deacons — rather than the participle οὖσιν.',
      sourceType: 'syntax-only',
      confidence: 'medium',
      syntaxPatch: {
        relations: {
          update: { r_s0_17: { headId: 'w_500010010090010' } },
        },
      },
    },

    // Philippians 2:6 — two semantic senses, same tree
    {
      id: 'alt_phil_2_6_rapienda',
      issueId: 'iss_phil_2_6_harpagmos',
      passageId: 'gnt_philippians_19',
      label: 'res rapienda — a prize to be seized',
      shortLabel: 'to be seized',
      interpretation: 'Equality with God as something not yet grasped.',
      description:
        'ἁρπαγμός read actively: Christ did not regard equality with God as something to be seized or grasped at.',
      sourceType: 'semantic-only',
      confidence: 'medium',
      semanticOverlay: {
        relationId: 'r_s19_20',
        nodeId: 'w_500020060070010',
        semanticLabel: 'res rapienda (a thing to be seized)',
        explanation:
          'Takes ἁρπαγμός actively — a prize to be grasped at — so the emphasis falls on what Christ declined to seize.',
      },
    },
    {
      id: 'alt_phil_2_6_rapta',
      issueId: 'iss_phil_2_6_harpagmos',
      passageId: 'gnt_philippians_19',
      label: 'res rapta — something held, not exploited',
      shortLabel: 'not exploited',
      interpretation: 'Equality with God as something already possessed and not used for advantage.',
      description:
        'ἁρπαγμός read in the idiom “regard as something to take advantage of”: Christ did not exploit the equality he already had.',
      sourceType: 'semantic-only',
      confidence: 'medium',
      semanticOverlay: {
        relationId: 'r_s19_20',
        nodeId: 'w_500020060070010',
        semanticLabel: 'res rapta (something to exploit)',
        explanation:
          'Takes the idiom ἁρπαγμὸν ἡγεῖσθαι as “regard as a means of advantage” — Christ held equality but did not exploit it.',
      },
    },

    // Philippians 3:9 — three semantic senses, same tree
    {
      id: 'alt_phil_3_9_objective',
      issueId: 'iss_phil_3_9_pistis_christou',
      passageId: 'gnt_philippians_43',
      label: 'Objective genitive — faith in Christ',
      shortLabel: 'faith in Christ',
      interpretation: 'Χριστοῦ is the object of the believer’s faith.',
      description: 'Reads πίστεως Χριστοῦ as “faith directed toward Christ”.',
      sourceType: 'semantic-only',
      confidence: 'medium',
      semanticOverlay: {
        relationId: 'r_s43_36',
        semanticLabel: 'objective genitive',
        explanation: 'Christ is the object of faith — “faith in Christ”.',
      },
    },
    {
      id: 'alt_phil_3_9_subjective',
      issueId: 'iss_phil_3_9_pistis_christou',
      passageId: 'gnt_philippians_43',
      label: 'Subjective genitive — the faithfulness of Christ',
      shortLabel: 'faithfulness of Christ',
      interpretation: 'Χριστοῦ is the one who is faithful.',
      description: 'Reads πίστεως Χριστοῦ as “the faithfulness of Christ”.',
      sourceType: 'semantic-only',
      confidence: 'medium',
      semanticOverlay: {
        relationId: 'r_s43_36',
        semanticLabel: 'subjective genitive',
        explanation: 'Christ is the subject — his own faithfulness.',
      },
    },
    {
      id: 'alt_phil_3_9_plenary',
      issueId: 'iss_phil_3_9_pistis_christou',
      passageId: 'gnt_philippians_43',
      label: 'Plenary / broader genitive',
      shortLabel: 'plenary',
      interpretation: 'Both senses are held together.',
      description: 'Reads the genitive broadly, holding both the believer’s faith and Christ’s faithfulness.',
      sourceType: 'semantic-only',
      confidence: 'low',
      semanticOverlay: {
        relationId: 'r_s43_36',
        semanticLabel: 'plenary genitive',
        explanation: 'A deliberately broad construal that does not force a single direction.',
      },
    },

    // Titus 2:13
    {
      id: 'alt_titus_2_13_two_referents',
      issueId: 'iss_titus_2_13_granville',
      passageId: 'gnt_titus_17',
      label: 'Two referents (God; and Savior Jesus Christ)',
      shortLabel: 'two referents',
      interpretation: 'God the Father and the Savior Jesus Christ are distinguished.',
      description:
        'Χριστοῦ Ἰησοῦ and ἡμῶν attach to Σωτῆρος rather than Θεοῦ, distinguishing “the great God” from “our Savior Jesus Christ”.',
      sourceType: 'syntax-only',
      confidence: 'low',
      syntaxPatch: {
        relations: {
          update: {
            r_s17_38: { headId: 'w_560020130130010' },
            r_s17_35: { headId: 'w_560020130130010' },
          },
        },
      },
    },

    // Matthew 4:3 — subordinate the ἵνα clause to εἰπὲ (pedestal), and read the
    // demonstrative οὗτοι as an adjectival modifier of λίθοι rather than apposition.
    {
      id: 'alt_matt_4_3_command',
      issueId: 'iss_matt_4_3_command',
      passageId: 'gnt_matthew_48',
      label: 'Commanded content clause (εἰπὲ governs ἵνα); οὗτοι adjectival',
      shortLabel: 'commanded clause',
      interpretation:
        'The ἵνα-clause is the content of the command — the object of εἰπὲ — and οὗτοι modifies λίθοι.',
      description:
        'Reads “εἰπὲ ἵνα …” as a command whose content clause is its object (drawn on a pedestal under εἰπὲ), and takes the demonstrative οὗτοι as an adjectival modifier of οἱ λίθοι rather than an apposition.',
      sourceType: 'syntax-only',
      confidence: 'medium',
      syntaxPatch: {
        relations: {
          update: {
            // Re-point the ἵνα-clause from a flat conjunct to the object of εἰπὲ
            // (the connector keeps its ἵνα label); pedestal it under the verb.
            r_s48_19: { headId: 'w_400040030120010', type: 'directObject' },
            // οὗτοι: apposition → adjectival (a slanted demonstrative on λίθοι).
            r_s48_16: { type: 'adjectival' },
          },
        },
      },
    },

    // Romans 9:5 — cross-boundary structural overlay on the MERGED document:
    // re-attach the doxology clause (sentence 229's root) to ὁ Χριστός at the end
    // of sentence 228 as an apposition, instead of hanging as its own sentence
    // under the discourse root. Ids are the `combinePassage`-prefixed ones.
    {
      id: 'alt_rom_9_5_to_christ',
      issueId: 'iss_rom_9_5_doxology',
      passageId: 'gnt_romans_228',
      label: 'Refers to Christ',
      shortLabel: 'of Christ',
      interpretation: 'The clause describes Christ as “over all, God blessed forever”.',
      description:
        'Read with the previous clause: ὁ Χριστὸς … ὁ ὢν ἐπὶ πάντων θεός — Christ is the one who is over all, God blessed forever. The doxology attaches in apposition to Χριστός instead of standing as its own sentence.',
      sourceType: 'syntax-only',
      confidence: 'medium',
      syntaxPatch: {
        relations: {
          update: {
            disc_r1: {
              headId: 's0_w_450090050080010',
              type: 'apposition',
              label: 'in apposition to Χριστός',
              provenance: MANUAL_LOW,
            },
          },
        },
      },
    },

    // Genesis 1:1
    {
      id: 'alt_gen_1_1_construct',
      issueId: 'iss_gen_1_1_construct',
      passageId: 'wlc_genesis_1_0',
      label: 'Construct — “When God began to create…”',
      shortLabel: 'construct',
      interpretation: 'v.1 is a dependent temporal clause.',
      description:
        'בְּרֵאשִׁית is taken as a construct governing the verbal clause, so v.1 reads “When God began to create the heavens and the earth…” as a temporal clause.',
      sourceType: 'syntax-only',
      confidence: 'medium',
      syntaxPatch: {
        nodes: {
          update: { cl_h0_0: { clauseType: 'adverbial' } },
        },
        relations: {
          upsert: [
            {
              id: 'alt_gen11_construct_rel',
              type: 'genitive',
              headId: 'w_o010010010012',
              dependentId: 'w_o010010010021',
              label: 'construct (“in the beginning of [God’s] creating”)',
              provenance: MANUAL_LOW,
            },
          ],
        },
      },
    },

    // 1 Timothy 3:16 — textual variants (no overlay; different wording)
    {
      id: 'alt_1tim_3_16_theos',
      issueId: 'iss_1tim_3_16_variant',
      passageId: 'gnt_1-timothy_34',
      label: 'θεός — “God was manifested in flesh”',
      shortLabel: 'θεός',
      interpretation: 'The Byzantine/TR reading names God explicitly.',
      description:
        'A large body of later manuscripts reads θεός instead of ὅς. This depends on a different Greek wording and is shown as a textual variant.',
      sourceType: 'textual-variant',
      confidence: 'low',
      textualVariant: {
        label: 'θεός',
        greekText: 'θεὸς ἐφανερώθη ἐν σαρκί',
        differsFromBase: true,
        affectedBaseTokenIds: ['t_540030160090010'],
        variantTokens: [{ surface: 'θεός', lemma: 'θεός', gloss: 'God' }],
        note: 'Byzantine / Textus Receptus reading; the earliest witnesses read ὅς.',
      },
    },
    {
      id: 'alt_1tim_3_16_neuter',
      issueId: 'iss_1tim_3_16_variant',
      passageId: 'gnt_1-timothy_34',
      label: 'ὅ — neuter, agreeing with μυστήριον',
      shortLabel: 'ὅ',
      interpretation: 'The neuter relative agrees with “mystery”.',
      description:
        'A few witnesses read the neuter ὅ, agreeing grammatically with μυστήριον in the previous clause. A different wording, shown as a textual variant.',
      sourceType: 'textual-variant',
      confidence: 'low',
      textualVariant: {
        label: 'ὅ',
        greekText: 'ὃ ἐφανερώθη ἐν σαρκί',
        differsFromBase: true,
        affectedBaseTokenIds: ['t_540030160090010'],
        variantTokens: [{ surface: 'ὅ', lemma: 'ὅς', gloss: 'which' }],
        note: 'Agrees with μυστήριον (neuter).',
      },
    },

    // Romans 3:22 — three semantic senses, same tree
    {
      id: 'alt_rom_3_22_objective',
      issueId: 'iss_rom_3_22_pistis_christou',
      passageId: 'gnt_romans_65',
      label: 'Objective genitive — faith in Christ',
      shortLabel: 'faith in Christ',
      interpretation: 'Christ is the object of the believer’s faith.',
      description: 'Reads πίστεως Ἰησοῦ Χριστοῦ as “faith directed toward Jesus Christ”.',
      sourceType: 'semantic-only',
      confidence: 'medium',
      semanticOverlay: {
        relationId: 'r_s65_18',
        semanticLabel: 'objective genitive',
        explanation: 'Christ is the object of faith — “faith in Christ”.',
      },
    },
    {
      id: 'alt_rom_3_22_subjective',
      issueId: 'iss_rom_3_22_pistis_christou',
      passageId: 'gnt_romans_65',
      label: 'Subjective genitive — the faithfulness of Christ',
      shortLabel: 'faithfulness of Christ',
      interpretation: 'Christ is the one who is faithful.',
      description: 'Reads πίστεως Ἰησοῦ Χριστοῦ as “the faithfulness of Jesus Christ”.',
      sourceType: 'semantic-only',
      confidence: 'medium',
      semanticOverlay: {
        relationId: 'r_s65_18',
        semanticLabel: 'subjective genitive',
        explanation: 'Christ is the subject — his own faithfulness.',
      },
    },
    {
      id: 'alt_rom_3_22_plenary',
      issueId: 'iss_rom_3_22_pistis_christou',
      passageId: 'gnt_romans_65',
      label: 'Plenary / broader genitive',
      shortLabel: 'plenary',
      interpretation: 'Both senses are held together.',
      description: 'Reads the genitive broadly, holding both the believer’s faith and Christ’s faithfulness.',
      sourceType: 'semantic-only',
      confidence: 'low',
      semanticOverlay: {
        relationId: 'r_s65_18',
        semanticLabel: 'plenary genitive',
        explanation: 'A deliberately broad construal that does not force a single direction.',
      },
    },

    // Galatians 2:16 — two semantic senses, same tree (anchored on the first occurrence)
    {
      id: 'alt_gal_2_16_objective',
      issueId: 'iss_gal_2_16_pistis_christou',
      passageId: 'gnt_galatians_28',
      label: 'Objective genitive — faith in Christ',
      shortLabel: 'faith in Christ',
      interpretation: 'Christ is the object of faith.',
      description: 'Reads πίστεως Χριστοῦ as “faith directed toward Christ”.',
      sourceType: 'semantic-only',
      confidence: 'medium',
      semanticOverlay: {
        relationId: 'r_s28_25',
        semanticLabel: 'objective genitive',
        explanation: 'Christ is the object of faith — “faith in Christ”.',
      },
    },
    {
      id: 'alt_gal_2_16_subjective',
      issueId: 'iss_gal_2_16_pistis_christou',
      passageId: 'gnt_galatians_28',
      label: 'Subjective genitive — the faithfulness of Christ',
      shortLabel: 'faithfulness of Christ',
      interpretation: 'Christ is the one who is faithful.',
      description: 'Reads πίστεως Χριστοῦ as “the faithfulness of Christ”.',
      sourceType: 'semantic-only',
      confidence: 'medium',
      semanticOverlay: {
        relationId: 'r_s28_25',
        semanticLabel: 'subjective genitive',
        explanation: 'Christ is the subject — his own faithfulness.',
      },
    },

    // Colossians 1:15 — relation of the genitive (same tree)
    {
      id: 'alt_col_1_15_supremacy',
      issueId: 'iss_col_1_15_firstborn',
      passageId: 'gnt_colossians_3',
      label: 'Genitive of subordination — firstborn over creation',
      shortLabel: 'over creation',
      interpretation: 'Christ ranks over all creation as its firstborn/heir.',
      description:
        'Reads πρωτότοκος πάσης κτίσεως as “firstborn — first in rank — over all creation”, with v. 16 (“for in him all things were created”) as the ground.',
      sourceType: 'semantic-only',
      confidence: 'medium',
      semanticOverlay: {
        relationId: 'r_s3_116',
        semanticLabel: 'genitive of subordination (supremacy over)',
        explanation: 'Christ is supreme over creation, not part of it — “firstborn” marks rank/heirship.',
      },
    },
    {
      id: 'alt_col_1_15_partitive',
      issueId: 'iss_col_1_15_firstborn',
      passageId: 'gnt_colossians_3',
      label: 'Partitive genitive — firstborn within creation',
      shortLabel: 'within creation',
      interpretation: 'Christ is the first member of the created order.',
      description: 'Reads the genitive partitively — “firstborn within creation” — making Christ part of what is created.',
      sourceType: 'semantic-only',
      confidence: 'low',
      semanticOverlay: {
        relationId: 'r_s3_116',
        semanticLabel: 'partitive genitive',
        explanation: 'Takes πρωτότοκος as one of the κτίσις — the reading the surrounding context is usually read against.',
      },
    },

    // Colossians 2:18 — objective vs subjective genitive (same tree)
    {
      id: 'alt_col_2_18_objective',
      issueId: 'iss_col_2_18_angels',
      passageId: 'gnt_colossians_17',
      label: 'Objective genitive — worship directed to angels',
      shortLabel: 'worship of angels',
      interpretation: 'The angels are the objects of worship.',
      description: 'Reads θρησκείᾳ τῶν ἀγγέλων as veneration offered TO angels.',
      sourceType: 'semantic-only',
      confidence: 'medium',
      semanticOverlay: {
        relationId: 'r_s17_6',
        semanticLabel: 'objective genitive',
        explanation: 'Angels are the object — worship directed to angels.',
      },
    },
    {
      id: 'alt_col_2_18_subjective',
      issueId: 'iss_col_2_18_angels',
      passageId: 'gnt_colossians_17',
      label: 'Subjective genitive — the angels’ own worship',
      shortLabel: 'angelic worship',
      interpretation: 'The worship is the angels’ own, which the visionary claims to share.',
      description: 'Reads θρησκείᾳ τῶν ἀγγέλων as the heavenly worship that angels OFFER, entered through visionary ascent.',
      sourceType: 'semantic-only',
      confidence: 'medium',
      semanticOverlay: {
        relationId: 'r_s17_6',
        semanticLabel: 'subjective genitive',
        explanation: 'Angels are the worshippers — participation in angelic worship.',
      },
    },

    // Ephesians 2:8-9 — antecedent candidates (review-only; no structural change)
    {
      id: 'alt_eph_2_8_faith',
      issueId: 'iss_eph_2_8_touto',
      passageId: 'gnt_ephesians_13',
      label: 'Refers to faith',
      shortLabel: 'faith',
      interpretation: 'τοῦτο points to πίστις (faith) as the gift.',
      description:
        'Takes the gift to be faith specifically — a conceptual reference, since πίστις is feminine and τοῦτο neuter.',
      sourceType: 'review-only',
      confidence: 'low',
    },
    {
      id: 'alt_eph_2_8_grace',
      issueId: 'iss_eph_2_8_touto',
      passageId: 'gnt_ephesians_13',
      label: 'Refers to grace',
      shortLabel: 'grace',
      interpretation: 'τοῦτο points to χάρις (grace).',
      description: 'Takes the gift to be grace — again a conceptual rather than grammatical-gender agreement.',
      sourceType: 'review-only',
      confidence: 'low',
    },

    // Acts 2:38 — force of εἰς (same tree)
    {
      id: 'alt_acts_2_38_purpose',
      issueId: 'iss_acts_2_38_eis_aphesin',
      passageId: 'gnt_acts_46',
      label: 'Purpose / result — for forgiveness',
      shortLabel: 'purpose',
      interpretation: 'Baptism is oriented toward receiving forgiveness.',
      description: 'εἰς marks the goal: “be baptized so as to receive the forgiveness of sins”.',
      sourceType: 'semantic-only',
      confidence: 'medium',
      semanticOverlay: {
        relationId: 'r_s46_19',
        semanticLabel: 'purpose / result',
        explanation: 'εἰς ἄφεσιν expresses the aim/result of the command.',
      },
    },
    {
      id: 'alt_acts_2_38_basis',
      issueId: 'iss_acts_2_38_eis_aphesin',
      passageId: 'gnt_acts_46',
      label: 'Reference / basis — with reference to forgiveness',
      shortLabel: 'reference',
      interpretation: 'Baptism is on the basis of / with reference to forgiveness already granted.',
      description: 'εἰς marks reference or basis: “be baptized with reference to (or because of) the forgiveness of sins”.',
      sourceType: 'semantic-only',
      confidence: 'low',
      semanticOverlay: {
        relationId: 'r_s46_19',
        semanticLabel: 'reference / basis',
        explanation: 'Takes εἰς as causal/referential rather than telic.',
      },
    },

    // 2 Corinthians 5:4 — Reed-Kellogg / Leedy construal
    {
      id: 'alt_2cor_5_4_leedy',
      issueId: 'iss_2cor_5_4_leedy',
      passageId: 'gnt_2-corinthians_67',
      label: 'Reed-Kellogg / Leedy construal',
      shortLabel: 'Leedy',
      interpretation:
        'ἵνα is a purpose clause under ἐπενδύσασθαι; οὐ … ἀλλά coordinate two infinitive objects of θέλομεν; γάρ introduces the main clause.',
      description:
        'Subordinates ἵνα καταποθῇ τὸ θνητόν … as a purpose clause hanging off ἐπενδύσασθαι; reads ἐκδύσασθαι and ἐπενδύσασθαι as the two coordinated direct objects of θέλομεν joined by the correlative οὐ … ἀλλά; takes γάρ as an introductory connective of the main clause (στενάζομεν); and supplies the elided subject of θέλομεν as (X).',
      sourceType: 'syntax-only',
      confidence: 'medium',
      syntaxPatch: {
        nodes: {
          upsert: [
            {
              id: 'n_2cor54_subj_x',
              kind: 'word',
              role: 'subject',
              tokenIds: [],
              implied: true,
              provenance: MANUAL_LOW,
            },
          ],
          remove: ['cl_470050040020230'], // the top-level coordinate wrapper
        },
        relations: {
          upsert: [
            {
              id: 'r_2cor54_subj_x',
              type: 'subject',
              headId: 'cl_470050040110060', // θέλομεν clause
              dependentId: 'n_2cor54_subj_x',
              provenance: MANUAL_LOW,
            },
          ],
          update: {
            // γάρ: top-level coordinator → introductory particle of the main clause.
            r_s67_26: { headId: 'cl_470050040010150', type: 'particle' },
            // ἵνα purpose clause → under the infinitive complex; "we wish … to be
            // further clothed, so that mortality be swallowed up by life".
            r_s67_25: { headId: 'cl_470050040120042', type: 'adverbial', label: 'ἵνα' },
            // οὐ ἐκδύσασθαι ἀλλ' ἐπενδύσασθαι: ἐκδύσασθαι heads the coordinated
            // infinitive-object pair (top, paired with οὐ) and ἐπενδύσασθαι is its
            // conjunct (bottom, paired with ἀλλ'), so the correlative reads
            // οὐ … ἀλλά top-to-bottom and οὐ negates ἐκδύσασθαι.
            r_s67_14: { dependentId: 'w_470050040140010' },
            r_s67_12: {
              headId: 'w_470050040140010',
              dependentId: 'w_470050040160010',
              type: 'conjunct',
            },
            r_s67_11: { headId: 'w_470050040140010', type: 'coordinator' },
            r_s67_13: { headId: 'w_470050040140010' },
          },
          remove: ['r_s67_18'], // dangling conjunct from the removed wrapper
        },
        rootId: 'cl_470050040010150', // re-root to the στενάζομεν clause
      },
    },

    // ═══════════════════ Major NT textual variants (readings) ═══════════════════

    // Mark 1:41 — ὀργισθεὶς ("moved with anger")
    {
      id: 'alt_mark_1_41_anger',
      issueId: 'iss_mark_1_41_variant',
      passageId: 'gnt_mark_38',
      label: 'ὀργισθεὶς — “moved with anger”',
      shortLabel: 'ὀργισθεὶς',
      interpretation: 'Jesus is moved with anger/indignation, not compassion.',
      description:
        'Codex Bezae and several Old Latin witnesses read ὀργισθεὶς. Some editors adopt it as the “harder reading” a scribe would sooner soften than create. Shown as a textual variant.',
      sourceType: 'textual-variant',
      confidence: 'low',
      textualVariant: {
        label: 'ὀργισθεὶς',
        greekText: 'καὶ ὀργισθεὶς ἐκτείνας τὴν χεῖρα αὐτοῦ ἥψατο',
        differsFromBase: true,
        affectedBaseTokenIds: ['t_410010410020010'],
        variantTokens: [{ surface: 'ὀργισθεὶς', lemma: 'ὀργίζω', gloss: 'having been angered' }],
        note: 'Western reading (D, part of the Old Latin); NET translates “moved with indignation”.',
      },
    },

    // John 1:18 — ὁ μονογενὴς υἱός ("the only Son")
    {
      id: 'alt_john_1_18_son',
      issueId: 'iss_john_1_18_variant',
      passageId: 'gnt_john_16',
      label: 'ὁ μονογενὴς υἱός — “the only Son”',
      shortLabel: 'υἱός',
      interpretation: 'The Son, not “God”, is the one who makes the Father known.',
      description:
        'Many later witnesses (A C³ Θ Ψ 𝔐) read ὁ μονογενὴς υἱός, the more familiar Johannine phrase (cf. 3:16). Shown as a textual variant; base tokens unchanged.',
      sourceType: 'textual-variant',
      confidence: 'low',
      textualVariant: {
        label: 'υἱός',
        greekText: 'ὁ μονογενὴς υἱὸς … ἐκεῖνος ἐξηγήσατο',
        differsFromBase: true,
        affectedBaseTokenIds: ['t_430010180060010'],
        variantTokens: [{ surface: 'υἱός', lemma: 'υἱός', gloss: 'Son' }],
        note: 'ΥΣ vs ΘΣ in the nomina sacra — a single-letter difference.',
      },
    },

    // Acts 20:28 — τοῦ κυρίου, and the conflate τοῦ κυρίου καὶ θεοῦ
    {
      id: 'alt_acts_20_28_lord',
      issueId: 'iss_acts_20_28_variant',
      passageId: 'gnt_acts_647',
      label: 'τοῦ κυρίου — “church of the Lord”',
      shortLabel: 'κυρίου',
      interpretation: 'The flock is the Lord’s (Christ’s), avoiding “God’s blood”.',
      description:
        'A weighty group (𝔓74 A C D E Ψ) reads κυρίου, which removes the “God’s own blood” implication. Shown as a textual variant.',
      sourceType: 'textual-variant',
      confidence: 'low',
      textualVariant: {
        label: 'κυρίου',
        greekText: 'τὴν ἐκκλησίαν τοῦ κυρίου',
        differsFromBase: true,
        affectedBaseTokenIds: ['t_440200280200010'],
        variantTokens: [{ surface: 'κυρίου', lemma: 'κύριος', gloss: 'of [the] Lord' }],
        note: 'Alexandrian/Western witnesses; NET keeps “of God” on internal grounds.',
      },
    },
    {
      id: 'alt_acts_20_28_lord_and_god',
      issueId: 'iss_acts_20_28_variant',
      passageId: 'gnt_acts_647',
      label: 'τοῦ κυρίου καὶ θεοῦ — “of the Lord and God”',
      shortLabel: 'κυρίου καὶ θεοῦ',
      interpretation: 'A conflate reading naming both titles.',
      description:
        'Later manuscripts (Byzantine, Textus Receptus) conflate the two into “the church of the Lord and God”. Shown as a textual variant.',
      sourceType: 'textual-variant',
      confidence: 'low',
      textualVariant: {
        label: 'κυρίου καὶ θεοῦ',
        greekText: 'τὴν ἐκκλησίαν τοῦ κυρίου καὶ θεοῦ',
        differsFromBase: true,
        affectedBaseTokenIds: ['t_440200280200010'],
        variantTokens: [
          { surface: 'κυρίου', lemma: 'κύριος', gloss: 'of [the] Lord' },
          { surface: 'καὶ', lemma: 'καί', gloss: 'and' },
          { surface: 'θεοῦ', lemma: 'θεός', gloss: 'God' },
        ],
        note: 'Byzantine / Textus Receptus conflation.',
      },
    },

    // Romans 5:1 — ἔχομεν (indicative)
    {
      id: 'alt_rom_5_1_indicative',
      issueId: 'iss_rom_5_1_variant',
      passageId: 'gnt_romans_101',
      label: 'ἔχομεν — “we have peace” (indicative)',
      shortLabel: 'ἔχομεν',
      interpretation: 'A statement of possessed peace rather than an exhortation.',
      description:
        'Reading the indicative ἔχομεν makes v.1 declare “we have peace with God”. Most modern editors judge this the likely original on internal grounds. Shown as a textual variant.',
      sourceType: 'textual-variant',
      confidence: 'medium',
      textualVariant: {
        label: 'ἔχομεν',
        greekText: 'εἰρήνην ἔχομεν πρὸς τὸν θεόν',
        differsFromBase: true,
        affectedBaseTokenIds: ['t_450050010060010'],
        variantTokens: [{ surface: 'ἔχομεν', lemma: 'ἔχω', gloss: 'we have' }],
        note: 'Indicative (ο) vs the base subjunctive (ω); NET argues the indicative is probably correct.',
      },
    },

    // Luke 23:34 — omission of the prayer
    {
      id: 'alt_luke_23_34_omit',
      issueId: 'iss_luke_23_34_inclusion',
      passageId: 'gnt_luke_1082',
      label: 'Omitted — the prayer is absent',
      shortLabel: 'omitted',
      interpretation: 'Early witnesses lack Jesus’ prayer of forgiveness.',
      description:
        '𝔓75 ℵ* B D* W Θ and others omit the saying entirely; NA prints it in double brackets. Shown as a question of inclusion; the base retains the words.',
      sourceType: 'passage-inclusion',
      confidence: 'low',
      textualVariant: {
        label: 'omit',
        differsFromBase: true,
        affectedBaseTokenIds: [
          't_420230340050010',
          't_420230340060010',
          't_420230340070010',
          't_420230340080010',
          't_420230340090010',
          't_420230340100010',
          't_420230340110010',
          't_420230340120010',
        ],
        note: 'The prayer is absent in several early witnesses; NA prints it in double brackets.',
      },
    },

    // 1 Corinthians 13:3 — καυχήσωμαι ("that I may boast")
    {
      id: 'alt_1cor_13_3_boast',
      issueId: 'iss_1cor_13_3_variant',
      passageId: 'gnt_1-corinthians_376',
      label: 'καυχήσωμαι — “that I may boast”',
      shortLabel: 'καυχήσωμαι',
      interpretation: 'Giving over the body “that I may boast”, not “be burned”.',
      description:
        'The earliest witnesses (𝔓46 ℵ A B) read καυχήσωμαι — a one-letter (θ/χ) difference that shifts self-sacrifice to self-glory. Adopted by NA/UBS. Shown as a textual variant.',
      sourceType: 'textual-variant',
      confidence: 'medium',
      textualVariant: {
        label: 'καυχήσωμαι',
        greekText: 'ἵνα καυχήσωμαι',
        differsFromBase: true,
        affectedBaseTokenIds: ['t_460130030150010'],
        variantTokens: [{ surface: 'καυχήσωμαι', lemma: 'καυχάομαι', gloss: 'I may boast' }],
        note: 'Adopted by NA/UBS; the base prints καυθήσομαι (“be burned”).',
      },
    },

    // Matthew 5:22 — the added qualifier εἰκῇ ("without cause")
    {
      id: 'alt_matt_5_22_eike',
      issueId: 'iss_matt_5_22_variant',
      passageId: 'gnt_matthew_99',
      label: '+ εἰκῇ — “angry without cause”',
      shortLabel: '+ εἰκῇ',
      interpretation: 'Only unjustified anger is liable to judgment.',
      description:
        'Many witnesses (ℵ² D L W Θ 𝔐) add εἰκῇ (“without cause”) after “his brother”. Shown as a textual variant; the qualifier is not merged into the base tokens.',
      sourceType: 'textual-variant',
      confidence: 'low',
      textualVariant: {
        label: 'εἰκῇ',
        greekText: 'ὁ ὀργιζόμενος τῷ ἀδελφῷ αὐτοῦ εἰκῇ',
        differsFromBase: true,
        affectedBaseTokenIds: ['t_400050220080010'],
        variantTokens: [{ surface: 'εἰκῇ', lemma: 'εἰκῇ', gloss: 'without cause' }],
        note: 'Byzantine and many witnesses add εἰκῇ; the earliest (𝔓64vid ℵ* B) omit it.',
      },
    },
  ],
} as const;

export const contestedRegistry: ContestedRegistry = ContestedRegistrySchema.parse(RAW);
