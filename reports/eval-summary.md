# Chat Relevance Evaluation Report

**Date:** 2026-03-30
**Scenarios tested:** 25

## Overall Scores

| Metric | Score (1-5) |
|--------|------------|
| Relevance | **3.4** |
| Completeness | **2.6** |
| Age Appropriateness | **3.8** |

## Diagnosis Breakdown

| Diagnosis | Count | % |
|-----------|-------|---|
| good_match | 0 | 0% |
| partial_match | 18 | 72% |
| pipeline_issue | 3 | 12% |
| db_gap | 4 | 16% |

## Scores by Category

| Category | Avg Relevance | Queries |
|----------|--------------|--------|
| Weekend Planning | 2.8 | 4 |
| Age-Specific | 3.0 | 4 |
| Interest-Based | 4.2 | 5 |
| Budget-Conscious | 3.0 | 3 |
| Location-Specific | 4.3 | 3 |
| Specific Needs | 3.0 | 3 |
| Discovery | 3.3 | 3 |

## Failures (Relevance ≤ 2)

### Q2: "Any free events tomorrow?"
- **Diagnosis:** db_gap
- **Filters extracted:** `{"isFree":true,"dateFrom":"2026-03-31","dateTo":"2026-03-31"}`
- **Events returned:** 10
- **Judge:** The events returned are mostly promotional programs and not suitable for young children, with none specifically matching the user's query for free events suitable for a 6-year-old and a 3-year-old. The system failed to find age-appropriate free events for the requested date.

### Q3: "What's happening on Easter?"
- **Diagnosis:** pipeline_issue
- **Filters extracted:** `{"dateFrom":"2026-04-04","dateTo":"2026-04-04","location":"","categories":["family"]}`
- **Events returned:** 10
- **Judge:** The returned events are not directly relevant to Easter activities, and many missed upcoming family events that likely exist around the holiday. Age appropriateness varies, with only some events suitable for both children.

### Q4: "Activities for a rainy day?"
- **Diagnosis:** pipeline_issue
- **Filters extracted:** `{"categories":["family","arts","theater","attractions","children's activities"],"location":"Midtown"}`
- **Events returned:** 3
- **Judge:** The returned events primarily feature an Easter egg hunt, which may not be suitable for a rainy day indoor activity. Additionally, it seems there are suitable indoor events for the age group that were missed in the search results.

### Q7: "Something for a teenager, 13+"
- **Diagnosis:** db_gap
- **Filters extracted:** `{"ageMax":18}`
- **Events returned:** 10
- **Judge:** The returned events are not relevant to the user's request for events suitable for teenagers and do not fit the age range for the children either. There is a lack of available events in the database for the specified query.

### Q15: "Activities under $20 per person"
- **Diagnosis:** db_gap
- **Filters extracted:** `{"priceMax":20}`
- **Events returned:** 10
- **Judge:** The returned events are free but do not meet the user’s interest in activities priced under $20 per person, and they lack appropriate age-appropriate options for the children mentioned.

### Q22: "Bilingual Spanish events for kids"
- **Diagnosis:** db_gap
- **Filters extracted:** `{"search":"bilingual Spanish","location":"Midtown","ageMax":12}`
- **Events returned:** 0
- **Judge:** No events specifically focused on bilingual Spanish programming for children were found in the database, indicating a lack of such events in the current offerings. The relevant events retrieved do not match the user's query or provide age-appropriate options.

### Q23: "We're bored, suggest something fun"
- **Diagnosis:** pipeline_issue
- **Filters extracted:** `{}`
- **Events returned:** 10
- **Judge:** While some events are found, there are better options in the database, and the search did not capture relevant activities for the children’s ages and interests. The inclusion of creative and outdoor activities could greatly enhance the suggestions.


## Pipeline Issues (events exist but weren't found)

- **Q3:** "What's happening on Easter?" — The returned events are not directly relevant to Easter activities, and many missed upcoming family events that likely exist around the holiday. Age appropriateness varies, with only some events suitable for both children.
- **Q4:** "Activities for a rainy day?" — The returned events primarily feature an Easter egg hunt, which may not be suitable for a rainy day indoor activity. Additionally, it seems there are suitable indoor events for the age group that were missed in the search results.
- **Q23:** "We're bored, suggest something fun" — While some events are found, there are better options in the database, and the search did not capture relevant activities for the children’s ages and interests. The inclusion of creative and outdoor activities could greatly enhance the suggestions.

## Database Gaps (no relevant events exist)

- **Q2:** "Any free events tomorrow?" — The events returned are mostly promotional programs and not suitable for young children, with none specifically matching the user's query for free events suitable for a 6-year-old and a 3-year-old. The system failed to find age-appropriate free events for the requested date.
- **Q7:** "Something for a teenager, 13+" — The returned events are not relevant to the user's request for events suitable for teenagers and do not fit the age range for the children either. There is a lack of available events in the database for the specified query.
- **Q15:** "Activities under $20 per person" — The returned events are free but do not meet the user’s interest in activities priced under $20 per person, and they lack appropriate age-appropriate options for the children mentioned.
- **Q22:** "Bilingual Spanish events for kids" — No events specifically focused on bilingual Spanish programming for children were found in the database, indicating a lack of such events in the current offerings. The relevant events retrieved do not match the user's query or provide age-appropriate options.

## All Results

| # | Query | Relevance | Diagnosis | Events | Top Event |
|---|-------|-----------|-----------|--------|----------|
| 1 | What can we do this weekend? | 5/5 | partial_match | 3 | The East Midtown Easter Egg Hunt |
| 2 | Any free events tomorrow? | 2/5 | db_gap | 10 | Flavor Fanatic |
| 3 | What's happening on Easter? | 2/5 | pipeline_issue | 10 | Unity by Hard Rock |
| 4 | Activities for a rainy day? | 2/5 | pipeline_issue | 3 | The East Midtown Easter Egg Hunt |
| 5 | My son is 3, what's good for him? | 3/5 | partial_match | 10 | Unity by Hard Rock |
| 6 | Theater for a 7-year-old girl | 5/5 | partial_match | 10 | Pete the Cat |
| 7 | Something for a teenager, 13+ | 1/5 | db_gap | 10 | Flavor Fanatic |
| 8 | Baby-friendly activities for under 2 | 3/5 | partial_match | 10 | Unity by Hard Rock |
| 9 | Art classes for kids | 5/5 | partial_match | 10 | The Orchid Show: Mr. Flower Fantast |
| 10 | Outdoor activities in Brooklyn | 5/5 | partial_match | 10 | Aladdin & the Wonderful Lamp |
| 11 | Science museums for kids | 4/5 | partial_match | 5 | Seal Cruise |
| 12 | Dance or music classes | 4/5 | partial_match | 10 | The Very Hungry Caterpillar Interac |
| 13 | Sports activities for boys age 8 | 3/5 | partial_match | 10 | Pickleball Community Events |
| 14 | Free things to do with kids | 4/5 | partial_match | 10 | Unity by Hard Rock |
| 15 | Activities under $20 per person | 1/5 | db_gap | 10 | Flavor Fanatic |
| 16 | Cheap weekend options for a family of 4 | 4/5 | partial_match | 10 | Unity by Hard Rock |
| 17 | Events near Midtown Manhattan | 5/5 | partial_match | 3 | The East Midtown Easter Egg Hunt |
| 18 | What's happening in Brooklyn this week? | 4/5 | partial_match | 10 | Aladdin & the Wonderful Lamp |
| 19 | Anything in the Bronx for kids? | 4/5 | partial_match | 9 | The Orchid Show: Mr. Flower Fantast |
| 20 | Wheelchair accessible activities | 4/5 | partial_match | 10 | Unity by Hard Rock |
| 21 | Stroller-friendly events | 4/5 | partial_match | 10 | Unity by Hard Rock |
| 22 | Bilingual Spanish events for kids | 1/5 | db_gap | 0 | none |
| 23 | We're bored, suggest something fun | 2/5 | pipeline_issue | 10 | Flavor Fanatic |
| 24 | Best family experience in NYC right now | 4/5 | partial_match | 10 | Unity by Hard Rock |
| 25 | Something educational but fun for kids | 4/5 | partial_match | 10 | Unity by Hard Rock |
