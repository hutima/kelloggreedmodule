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

    // ─────────────────── Romans 9:5 (punctuation — doxology) ───────────────────
    {
      id: 'iss_rom_9_5_doxology',
      passageId: 'gnt_romans_229',
      verseRef: 'Romans 9:5',
      kind: 'punctuation',
      sourceType: 'punctuation-only',
      severity: 'major',
      label: 'ὁ ὢν ἐπὶ πάντων θεός — doxology or description of Christ',
      shortLabel: 'Doxology',
      summary:
        'The base data sets ὁ ὢν ἐπὶ πάντων θεὸς εὐλογητός as its OWN sentence — a doxology addressed to God. An alternate punctuation reads it in apposition to ὁ Χριστός in the previous clause (“Christ, who is over all, God blessed forever”). Because the two readings differ at the SENTENCE boundary, this is shown as a punctuation note rather than a single-sentence overlay.',
      affectedTokenIds: [
        't_450090050120010',
        't_450090050130010',
        't_450090050160010',
        't_450090050170010',
      ],
      affectedNodeIds: ['w_450090050130010', 'w_450090050160010', 'w_450090050170010'],
      defaultReading: {
        label: 'Independent doxology (to God)',
        description: 'The clause stands alone as a blessing of God “who is over all”.',
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

    // Romans 9:5 — review only, no overlay (cross-sentence)
    {
      id: 'alt_rom_9_5_to_christ',
      issueId: 'iss_rom_9_5_doxology',
      passageId: 'gnt_romans_229',
      label: 'Refers to Christ',
      shortLabel: 'of Christ',
      interpretation: 'The clause describes Christ as “over all, God blessed forever”.',
      description:
        'Read with the previous clause: ὁ Χριστὸς … ὁ ὢν ἐπὶ πάντων θεός — Christ is the one over all. Because this joins material across the base sentence boundary, it is presented as a punctuation note, not a structural overlay.',
      sourceType: 'punctuation-only',
      confidence: 'medium',
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
  ],
} as const;

export const contestedRegistry: ContestedRegistry = ContestedRegistrySchema.parse(RAW);
