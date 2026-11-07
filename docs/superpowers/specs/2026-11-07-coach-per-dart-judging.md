# Coach: judge each dart on the score left before it

A visit was tagged and graded by the score it started on: anything that started above 170 was
Scoring, so a 204 visit that left the bogey 174 (S5, S20, then a T20 from 179 that drifted into the 5)
was never judged as a setup. Now every dart is judged on the score left before it and the darts left
in the visit.

## Phases of a dart

| Dart                                                         | Judged by                                                             |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| more than 170 left, not the last dart of the 171–230 range   | its score (Scoring)                                                   |
| the visit's **last** dart with 171–230 left (a _leave dart_) | its leave: the chance it leaves a score no visit can finish (a bogey) |
| 170 or less left                                             | the checkout chance, as before (Setup, or Doubling on a one-dart out) |

230 is 170 plus a treble 20: from further out no dart can bring the leave into the checkout model's
range. Only the last dart is judged by its leave, because with more darts to come the leave is not final
and the checkout chances there are all too small to tell aims apart (T20 3.6% against T19 4.6% from 179).

## The leave check

A bogey is a score `minDarts` says needs more than three darts (159, 162, 163, 165, 166, 168, 169 and
everything above 170). For a leave dart the aim is `leaveCost`: the chance of a bogey leave of the dart's
aim minus that of the best aim (the highest checkout chance, of equal ones the safest leave,
`bestLeaveAim`). The aim is the dart's classified target when the camera placed it, else the safest aim on
the number it landed in or a neighbour. At least 25 points more (`BOGEY_THRESHOLD`) is a strategy note
(`byLeave`), which makes the visit Bad like any note. From 179: T19 leaves a bogey in 13% of the
throws, T20 in 68% (S20 159, S5 174, S1 178).

The aim recommender (`bestAims`) uses the same evaluator at the same score and darts left, and for a leave
dart leaves out the aims the check would flag, so the live panel and the grade agree.

## The visit

- **Tags**: every phase the visit went through, in the order Scoring, Setup, Doubling (`tagsOf`): Doubling
  for a dart on a one-dart finish, Setup for any other dart on 170 or less or a leave dart, else Scoring.
  A visit from 200 is Scoring and Setup; from 170 it is Setup and Doubling when its first darts hit the
  setup, else Setup alone. Never all three: one dart takes at most 60 off, so a visit cannot go from above
  170 to a one-dart finish and a Setup dart in between. The tags follow the darts, not the outcome, so a
  good leave carries Setup too. The leg review filters by a tag and a visit is under each of its tags.
- **Grade scale**: the finish scale (checkout-chance points of the darts on 170 or less) when a dart was
  on 170 or less, else the scoring scale (rating against the average). A note still makes the visit Bad,
  and the fewest-darts rule still floors or lifts it.
- **Skills**: a visit counts as a Setup visit when Setup is its last tag (a visit that went on to a
  Doubling dart stays a Doubling visit, as before). The Setup skill counts one as Bad when its checkout chance or a note made it Bad,
  not a low score on the scoring scale; the scoring counts (low visits, grouping) take every visit graded
  on the scoring scale, a leave dart's included.
- **Very low visit and spill** apply to the scoring scale and to darts with more than 170 left.
- A dart with more than 170 left has no value change (`delta` is null); on a mixed visit the darts on
  170 or less carry the finish grade.

Stored reviews are rebuilt (`COACH_VERSION` 30).
