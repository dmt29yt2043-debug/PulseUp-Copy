# Chat Relevance Evaluation Report

**Date:** 2026-04-07
**Endpoint:** https://pulseup-v2.srv1362562.hstgr.cloud/api/chat
**Scenarios tested:** 25
**Avg latency:** 3266ms

## Overall Scores

| Metric | Score (1-5) |
|--------|------------|
| Relevance | **3.2** |
| Completeness | **2.8** |
| Age Appropriateness | **4.2** |

## Diagnosis Breakdown

| Diagnosis | Count | % |
|-----------|-------|---|
| good_match | 2 | 8% |
| partial_match | 11 | 44% |
| pipeline_issue | 11 | 44% |
| db_gap | 1 | 4% |

## Scores by Category

| Category | Avg Relevance | Queries |
|----------|--------------|--------|
| Weekend Planning | 3.0 | 4 |
| Age-Specific | 3.5 | 4 |
| Interest-Based | 3.4 | 5 |
| Budget-Conscious | 4.0 | 3 |
| Location-Specific | 3.3 | 3 |
| Specific Needs | 1.3 | 3 |
| Discovery | 4.0 | 3 |

## Failures (Relevance ≤ 2)

### Q7: "Something for a teenager, 13+"
- **Diagnosis:** db_gap
- **Filters:** `{"ageMax":13}`
- **Events returned:** 10
- **Judge:** The returned events are not relevant to the query for teenager events, as all found events are targeted towards younger children. Therefore, there seems to be a gap in the database for suitable events for teens.

### Q12: "Dance or music classes"
- **Diagnosis:** pipeline_issue
- **Filters:** `{"search":"dance","categories":["family"]}`
- **Events returned:** 9
- **Judge:** The returned events are not relevant to the query about dance or music classes. Additionally, there are relevant music events available in the broader database search that were not surfaced.

### Q15: "Activities under $20 per person"
- **Diagnosis:** pipeline_issue
- **Filters:** `{"isFree":false,"dateFrom":"2026-04-07","dateTo":"2026-04-12"}`
- **Events returned:** 10
- **Judge:** The chatbot response provided one relevant event but missed several others that fit the user's budget and criteria, indicating that the system did not fully leverage the broader search results.

### Q19: "Anything in the Bronx for kids?"
- **Diagnosis:** pipeline_issue
- **Filters:** `{"neighborhoods":["Bronx"]}`
- **Events returned:** 10
- **Judge:** The returned event 'Brooklyn Museum Sunday Art Hang' is not in the Bronx, making it irrelevant. The system did not surface relevant Bronx events that match the user's budget and children's ages.

### Q20: "Wheelchair accessible activities"
- **Diagnosis:** pipeline_issue
- **Filters:** `{"wheelchairAccessible":true}`
- **Events returned:** 10
- **Judge:** The events returned did not address the user's query for wheelchair-accessible activities and instead showed unrelated events. However, a broader search indicated relevant activities that meet the criteria.

### Q21: "Stroller-friendly events"
- **Diagnosis:** pipeline_issue
- **Filters:** `{"strollerFriendly":true}`
- **Events returned:** 10
- **Judge:** The chatbot response included events that were not in the returned list, indicating that there are relevant events not being surfaced. Additionally, the age fit for returned events is limited, especially for the 3-year-old.

### Q22: "Bilingual Spanish events for kids"
- **Diagnosis:** pipeline_issue
- **Filters:** `{}`
- **Events returned:** 10
- **Judge:** The returned events do not match the request for bilingual Spanish events, and relevant events exist in the broader database search that the system did not surface.


## Pipeline Issues (events exist but weren't found)

- **Q1:** "What can we do this weekend?" — The chatbot response mentioned events that do not match the date range of the query and missed relevant events like 'American Girl® Doll Care Center - Doll Hospital' which fit both the budget and age criteria.
- **Q2:** "Any free events tomorrow?" — The returned events were somewhat relevant but did not include any of the found events from the broader database search that fit the criteria for free events on the specified date. The chatbot's response also mentioned an event that was not actually returned. Additionally, while most events are age-appropriate, there could be more options explicitly tailored for both children.
- **Q4:** "Activities for a rainy day?" — While some returned events are relevant, such as indoor activities, many relevant options exist in the broader database that were not surfaced. Additionally, the event mentioned was not part of the initial results.
- **Q8:** "Baby-friendly activities for under 2" — The returned events were mostly for older children and did not include specific activities for infants under 2 years old. However, there are relevant events available in the broader database that were not surfaced.
- **Q12:** "Dance or music classes" — The returned events are not relevant to the query about dance or music classes. Additionally, there are relevant music events available in the broader database search that were not surfaced.
- **Q15:** "Activities under $20 per person" — The chatbot response provided one relevant event but missed several others that fit the user's budget and criteria, indicating that the system did not fully leverage the broader search results.
- **Q19:** "Anything in the Bronx for kids?" — The returned event 'Brooklyn Museum Sunday Art Hang' is not in the Bronx, making it irrelevant. The system did not surface relevant Bronx events that match the user's budget and children's ages.
- **Q20:** "Wheelchair accessible activities" — The events returned did not address the user's query for wheelchair-accessible activities and instead showed unrelated events. However, a broader search indicated relevant activities that meet the criteria.
- **Q21:** "Stroller-friendly events" — The chatbot response included events that were not in the returned list, indicating that there are relevant events not being surfaced. Additionally, the age fit for returned events is limited, especially for the 3-year-old.
- **Q22:** "Bilingual Spanish events for kids" — The returned events do not match the request for bilingual Spanish events, and relevant events exist in the broader database search that the system did not surface.
- **Q24:** "Best family experience in NYC right now" — While the returned events were somewhat relevant, the chatbot missed several opportunities to present age-appropriate activities, like the Comic Book Art Class or RECESS!, which would appeal to both children based on their interests. A broader search could have yielded more fitting options.

## Database Gaps (no relevant events exist)

- **Q7:** "Something for a teenager, 13+" — The returned events are not relevant to the query for teenager events, as all found events are targeted towards younger children. Therefore, there seems to be a gap in the database for suitable events for teens.

## All Results

| # | Query | Relevance | Diagnosis | Events | Top Event |
|---|-------|-----------|-----------|--------|----------|
| 1 | What can we do this weekend? | 3/5 | pipeline_issue | 10 | American Girl® Doll Care Center - D |
| 2 | Any free events tomorrow? | 3/5 | pipeline_issue | 10 | American Girl® Doll Care Center - D |
| 3 | What's happening on Easter? | 3/5 | partial_match | 10 | American Girl® Doll Care Center - D |
| 4 | Activities for a rainy day? | 3/5 | pipeline_issue | 10 | American Girl® Doll Care Center - D |
| 5 | My son is 3, what's good for him? | 4/5 | partial_match | 10 | Faith Ringgold: Artist, Storyteller |
| 6 | Theater for a 7-year-old girl | 5/5 | good_match | 10 | Circus Vazquez |
| 7 | Something for a teenager, 13+ | 1/5 | db_gap | 10 | American Girl® Doll Care Center - D |
| 8 | Baby-friendly activities for under 2 | 4/5 | pipeline_issue | 10 | Faith Ringgold: Artist, Storyteller |
| 9 | Art classes for kids | 4/5 | partial_match | 7 | Faith Ringgold: Artist, Storyteller |
| 10 | Outdoor activities in Brooklyn | 3/5 | partial_match | 3 | Earth Day on Governors Island |
| 11 | Science museums for kids | 4/5 | partial_match | 10 | Nature Festival |
| 12 | Dance or music classes | 1/5 | pipeline_issue | 9 | Mommy & Me Class: Music and Movemen |
| 13 | Sports activities for boys age 8 | 5/5 | partial_match | 4 | Brooklyn Cyclones Bark in the Park |
| 14 | Free things to do with kids | 5/5 | partial_match | 10 | American Girl® Doll Care Center - D |
| 15 | Activities under $20 per person | 2/5 | pipeline_issue | 10 | RECESS!! Epic Interactive Family Fu |
| 16 | Cheap weekend options for a family of 4 | 5/5 | partial_match | 10 | American Girl® Doll Care Center - D |
| 17 | Events near Midtown Manhattan | 5/5 | partial_match | 10 | American Girl® Doll Care Center - D |
| 18 | What's happening in Brooklyn this week? | 4/5 | partial_match | 10 | Comic Book Art Class for Kids |
| 19 | Anything in the Bronx for kids? | 1/5 | pipeline_issue | 10 | The Orchid Show: Mr. Flower Fantast |
| 20 | Wheelchair accessible activities | 1/5 | pipeline_issue | 10 | American Girl® Doll Care Center - D |
| 21 | Stroller-friendly events | 2/5 | pipeline_issue | 10 | American Girl® Doll Care Center - D |
| 22 | Bilingual Spanish events for kids | 1/5 | pipeline_issue | 10 | American Girl® Doll Care Center - D |
| 23 | We're bored, suggest something fun | 5/5 | good_match | 10 | American Girl® Doll Care Center - D |
| 24 | Best family experience in NYC right now | 3/5 | pipeline_issue | 10 | American Girl® Doll Care Center - D |
| 25 | Something educational but fun for kids | 4/5 | partial_match | 10 | Family Storytime: Preschool Fun! |
