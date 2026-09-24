# GPT output schema contract (C2)

Generated 2026-09-24 by `npm run eval:gpt-schemas` against a local mock of the Responses API. Result: **50/50 passed**.

| ID | Check | Result |
| --- | --- | --- |
| schema-00 | Every structured-output call in lib/ is covered (7 found) | passed |
| schema-01a | triage_second_opinion: schema is valid for OpenAI strict mode | passed |
| schema-01b | triage_second_opinion: schema matches the committed snapshot | passed |
| schema-01c | triage_second_opinion: a reply matching the schema is read and used | passed |
| schema-01-missing_field | triage_second_opinion: a reply with missing field is rejected and the rule-based path is used | passed |
| schema-01-wrong_type | triage_second_opinion: a reply with wrong type is rejected and the rule-based path is used | passed |
| schema-01-extra_field | triage_second_opinion: a reply with extra field is rejected and the rule-based path is used | passed |
| schema-01-not_json | triage_second_opinion: a reply with not json is rejected and the rule-based path is used | passed |
| schema-02a | dermasynth_category_selection: schema is valid for OpenAI strict mode | passed |
| schema-02b | dermasynth_category_selection: schema matches the committed snapshot | passed |
| schema-02c | dermasynth_category_selection: a reply matching the schema is read and used | passed |
| schema-02-missing_field | dermasynth_category_selection: a reply with missing field is rejected and the rule-based path is used | passed |
| schema-02-wrong_type | dermasynth_category_selection: a reply with wrong type is rejected and the rule-based path is used | passed |
| schema-02-extra_field | dermasynth_category_selection: a reply with extra field is rejected and the rule-based path is used | passed |
| schema-02-not_json | dermasynth_category_selection: a reply with not json is rejected and the rule-based path is used | passed |
| schema-03a | ingredient_selection: schema is valid for OpenAI strict mode | passed |
| schema-03b | ingredient_selection: schema matches the committed snapshot | passed |
| schema-03c | ingredient_selection: a reply matching the schema is read and used | passed |
| schema-03-missing_field | ingredient_selection: a reply with missing field is rejected and the rule-based path is used | passed |
| schema-03-wrong_type | ingredient_selection: a reply with wrong type is rejected and the rule-based path is used | passed |
| schema-03-extra_field | ingredient_selection: a reply with extra field is rejected and the rule-based path is used | passed |
| schema-03-not_json | ingredient_selection: a reply with not json is rejected and the rule-based path is used | passed |
| schema-04a | routine_context: schema is valid for OpenAI strict mode | passed |
| schema-04b | routine_context: schema matches the committed snapshot | passed |
| schema-04c | routine_context: a reply matching the schema is read and used | passed |
| schema-04-missing_field | routine_context: a reply with missing field is rejected and the rule-based path is used | passed |
| schema-04-wrong_type | routine_context: a reply with wrong type is rejected and the rule-based path is used | passed |
| schema-04-extra_field | routine_context: a reply with extra field is rejected and the rule-based path is used | passed |
| schema-04-not_json | routine_context: a reply with not json is rejected and the rule-based path is used | passed |
| schema-05a | cue_verdicts: schema is valid for OpenAI strict mode | passed |
| schema-05b | cue_verdicts: schema matches the committed snapshot | passed |
| schema-05c | cue_verdicts: a reply matching the schema is read and used | passed |
| schema-05-missing_field | cue_verdicts: a reply with missing field is rejected and the rule-based path is used | passed |
| schema-05-wrong_type | cue_verdicts: a reply with wrong type is rejected and the rule-based path is used | passed |
| schema-05-extra_field | cue_verdicts: a reply with extra field is rejected and the rule-based path is used | passed |
| schema-05-not_json | cue_verdicts: a reply with not json is rejected and the rule-based path is used | passed |
| schema-06a | cue_batch_verdicts: schema is valid for OpenAI strict mode | passed |
| schema-06b | cue_batch_verdicts: schema matches the committed snapshot | passed |
| schema-06c | cue_batch_verdicts: a reply matching the schema is read and used | passed |
| schema-06-missing_field | cue_batch_verdicts: a reply with missing field is rejected and the rule-based path is used | passed |
| schema-06-wrong_type | cue_batch_verdicts: a reply with wrong type is rejected and the rule-based path is used | passed |
| schema-06-extra_field | cue_batch_verdicts: a reply with extra field is rejected and the rule-based path is used | passed |
| schema-06-not_json | cue_batch_verdicts: a reply with not json is rejected and the rule-based path is used | passed |
| schema-07a | ingredient_rationales: schema is valid for OpenAI strict mode | passed |
| schema-07b | ingredient_rationales: schema matches the committed snapshot | passed |
| schema-07c | ingredient_rationales: a reply matching the schema is read and used | passed |
| schema-07-missing_field | ingredient_rationales: a reply with missing field is rejected and the rule-based path is used | passed |
| schema-07-wrong_type | ingredient_rationales: a reply with wrong type is rejected and the rule-based path is used | passed |
| schema-07-extra_field | ingredient_rationales: a reply with extra field is rejected and the rule-based path is used | passed |
| schema-07-not_json | ingredient_rationales: a reply with not json is rejected and the rule-based path is used | passed |

