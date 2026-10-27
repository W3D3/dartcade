DO $$
DECLARE
  me text := (SELECT id FROM "user" WHERE email = 'luke@dartcade.local');
  phil text := (SELECT id FROM "user" WHERE email = 'phil@dartcade.local');
  mich text := (SELECT id FROM "user" WHERE email = 'michael@dartcade.local');
  adm text := (SELECT id FROM "user" WHERE email = 'admin@dartcade.local');
  sid text;
  i int;
  ago interval;
  avg_ real;
  opp text;
  oppname text;
  lob text;
BEGIN

  -- my X01 games: 24 over the last 30 days, 6 before that for the trend
  FOR i IN 1..30 LOOP
    sid := 'me-' || i;
    ago := CASE WHEN i <= 24 THEN make_interval(days => (i * 29) / 24, hours => i % 5) ELSE make_interval(days => 31 + (i - 24) * 4) END;
    avg_ := CASE WHEN i <= 24 THEN 70 - i * 0.55 + (i % 4) * 3.1 - (i % 3) * 1.4 ELSE 58 + (i % 3) * 2 END;
    opp := CASE i % 3 WHEN 0 THEN phil WHEN 1 THEN mich ELSE adm END;
    oppname := (SELECT name FROM "user" WHERE id = opp);
    INSERT INTO game_sessions (id, game_id, config, status, created_at, owner_user_id, finished_at, visibility)
      VALUES (sid, 'x01', '{"startScore":501,"firstTo":1}', 'finished', now() - ago - interval '20 minutes', me, now() - ago, 'private');
    INSERT INTO game_players (session_id, seat, name, user_id, controller_user_id, placement, stats, throw_position) VALUES
      (sid, 0, 'Luke', me, me, CASE WHEN i % 3 = 0 THEN 2 ELSE 1 END,
        jsonb_build_object('average', round(avg_::numeric, 1), 'checkoutAttempts', 4 + i % 3, 'checkoutHits', 1 + (i % 2),
          'bestCheckout', 60 + (i * 7) % 90, 'count180', CASE WHEN i % 7 = 0 THEN 1 ELSE 0 END, 'tonOuts', CASE WHEN i % 9 = 0 THEN 1 ELSE 0 END), 0),
      (sid, 1, oppname, opp, opp, CASE WHEN i % 3 = 0 THEN 1 ELSE 2 END,
        jsonb_build_object('average', round((avg_ - 6)::numeric, 1)), 1);
  END LOOP;

  -- friends' games, for the activity feed
  INSERT INTO game_sessions (id, game_id, config, status, created_at, finished_at) VALUES
    ('fa-1', 'x01', '{"startScore":501,"firstTo":1}', 'finished', now() - interval '2 hours 20 minutes', now() - interval '2 hours'),
    ('fa-2', 'x01', '{"startScore":501,"firstTo":1}', 'finished', now() - interval '5 hours 30 minutes', now() - interval '5 hours'),
    ('fa-3', 'x01', '{"startScore":301,"firstTo":1}', 'finished', now() - interval '1 day 4 hours', now() - interval '1 day 3 hours'),
    ('fa-4', 'x01', '{"startScore":501,"firstTo":1}', 'finished', now() - interval '2 days 4 hours', now() - interval '2 days 3 hours'),
    ('fa-5', 'x01', '{"startScore":501,"firstTo":1}', 'finished', now() - interval '4 days', now() - interval '4 days' + interval '30 minutes');
  INSERT INTO friend_activity (user_id, game_id, kind, payload, created_at) VALUES
    (phil, 'fa-1', 'one_eighty', '{"count":1}', now() - interval '2 hours'),
    (adm, 'fa-2', 'ton_out', '{"count":1,"best":124}', now() - interval '5 hours'),
    (mich, 'fa-3', 'rank_up', '{"mode":"1v1","rankIndex":9}', now() - interval '1 day 3 hours'),
    (phil, 'fa-4', 'ton_out', '{"count":2,"best":141}', now() - interval '2 days 3 hours'),
    (mich, 'fa-5', 'one_eighty', '{"count":2}', now() - interval '4 days');

  -- friends' lobbies: one open with Join, one running
  INSERT INTO lobbies (id, name, host_user_id, code, access, next_game) VALUES
    ('lb-1', 'Admin''s lobby', adm, 'ADMN01', 'friends', '{"gameId":"x01","config":{"startScore":501}}'),
    ('lb-2', 'Michael''s lobby', mich, 'MICH02', 'friends', '{"gameId":"x01","config":{"startScore":301}}');
  INSERT INTO lobby_people (id, lobby_id, user_id, added_by_user_id, name, position, board_id) VALUES
    ('lp-1', 'lb-1', adm, adm, 'Admin', 0, NULL),
    ('lp-2', 'lb-2', mich, mich, 'Michael', 0, NULL);
  INSERT INTO game_sessions (id, game_id, config, status, owner_user_id, lobby_id)
    VALUES ('live-1', 'x01', '{"startScore":301,"firstTo":1}', 'active', mich, 'lb-2');

  -- ranked: Gold-ish stage with a last-five streak
  INSERT INTO ranked_ratings (user_id, mode, rating, rank_index, matches, wins, streak) VALUES (me, '1v1', 1432, 12, 23, 14, 2);
  FOR i IN 1..5 LOOP
    INSERT INTO ranked_results (session_id, user_id, mode, won, placement, rating_before, rating_after, average, created_at)
      VALUES ('me-' || i, me, '1v1', i NOT IN (3, 5), false, 1400 + i * 4, 1400 + i * 4 + CASE WHEN i IN (3, 5) THEN -14 ELSE 15 END, 58 + i, now() - make_interval(days => i));
  END LOOP;
END $$;
