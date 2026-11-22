# Song Guessing Game

A music quiz: players hear a short song clip and guess it, alone or together in a room.

## People

**Account**:
A person's registered identity, made of an email address, a password and a username. It can be used only once its email address is verified, and it is needed only to create a room.
_Avoid_: Profile, user, login

**Username**:
The unique name that identifies an account. No two accounts can have the same username, even with different upper/lower case. Signing up reserves the username; if the email address is never verified and the link expires, the username becomes free again.
_Avoid_: Handle, account name, nickname

**Guest**:
Someone who plays without an account.
_Avoid_: Anonymous user, visitor

**Nickname**:
The name a person shows in one game. Everyone (guest or account holder) chooses it before entering, and it can be different each game. An account can keep a usual nickname, which is suggested each time.
_Avoid_: Username, display name, player name

**Avatar**:
The picture a person shows next to their nickname in a room, picked from a fixed set. An account keeps its avatar, so an account holder is not asked again; a guest picks one each time they enter a room. Two players in a room may have the same one.
_Avoid_: Profile picture, icon

## Rooms

**Room code**:
The 6-digit number that leads into one room. Only an account holder can create a room; anyone with the code can join.
_Avoid_: Code, game code, PIN, invite code

**Room creator**:
The player in a room who can start the game early, extend the lobby countdown and kick a player who is away. At first it is the account holder who created the room. If they do not play again after a game, the role passes at random to another account holder who plays again, preferring one who was not away in the last round. Only an account holder can hold the role. Otherwise the room creator plays like everyone else.
_Avoid_: Host, owner, admin, operator

**Duel room**:
A room for exactly two players, each on their own device.
_Avoid_: Dual mode, 1v1, versus

**Multiplayer room**:
A room for two to twenty-five players, each on their own device. If only two players are in it when the game starts, they play it as a duel.
_Avoid_: Group mode, party mode, presentation mode

**Public room**:
A room listed under "Join a room" while it is in the lobby and not full, so anyone can find and join it. Rooms are public unless the room creator chooses private when creating the room; this cannot be changed afterwards.
_Avoid_: Open room

**Private room**:
A room that is not listed anywhere; people can join it only with its room code, its link or its QR code.
_Avoid_: Closed room, hidden room

**Lobby**:
The waiting stage of a room before its game starts. People can join only while the room is in the lobby. The game starts when the room is full, when the room creator starts it, or when the lobby countdown ends.
_Avoid_: Waiting room

**Lobby countdown**:
The 60 seconds after which a public room's game starts by itself, counted once at least two players are in it. In the last 15 seconds the room creator can extend it by another 60 seconds, at most five times. Private rooms have no lobby countdown.
_Avoid_: Timer, auto-start

**Away**:
A player whose device has stopped checking in with the room for a few seconds. They keep their seat and get no points for rounds they miss. After a minute away, the room creator may kick them, which removes them and their points.
_Avoid_: Offline, disconnected, idle

**Room settings**:
The choices the room creator makes when creating a room: public or private, mode, genres, decades, songs per set and number of sets. They cannot be changed afterwards. Genres and decades are "Any" unless specific ones are chosen. The same choices filter the list of public rooms.
_Avoid_: Options, config

## Playing

**Round**:
One song: the clip plays, every player answers one question about it, and the right answer is shown.
_Avoid_: Question, turn, song (when the whole step is meant)

**Set**:
A group of rounds in a room game, followed by the standings.
_Avoid_: Round, stage, level

**Set summary**:
A player's own list of the songs in a set: right or wrong, points, and a link to the song in iTunes. At the end of the game it covers every song.
_Avoid_: Results, recap

**Play again**:
The choice each player makes after a room's game ends. Those who choose it stay and the room goes back to the lobby with the same settings; everyone else leaves the room. A room hosts at most five games.
_Avoid_: Rematch, restart, new game

**Standings**:
The ranking of all players by total points so far, shown after each set and at the end of the game, and in every room game (duel included) also after each round. Equal points share a rank.
_Avoid_: Leaderboard, scoreboard, high scores
