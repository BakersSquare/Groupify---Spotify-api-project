var SpotifyWebApi = require('spotify-web-api-node')
var express = require('express');

const client_ID = '71d5e0f01594412c9ddd909810a4e69a';
const redirect_URL = 'http://localhost:8888/callback';
const client_Secret = 'd9da6362128a41c89fcfa1079844771d';
var user_ID = '';
var friendArray = [];
var playlistArray = [];
var megaSongs = [];
var myPlaylists = [];
var mySongs = [];
var sharedSongs = [];
var friendPlaylistLength = 0;
var countSorted = 0;

/* *********************************************************************************** */
function getUserID()
{
  spotifyApi.getMe()
  .then(data => {
    user_ID = data.body.id;
    return user_ID; 
  })
  .catch(e => console.log(e))
};

function getFriends(userparameter , offset)
{
  spotifyApi.getUserPlaylists(userparameter, {
    limit: 50,
    offset: offset
  })
  .then(data => {
    for(let playlist of data.body.items)
    {
      if((playlist.owner.id != user_ID) && (playlist.owner.id != 'spotify'))
        {
          friendArray.push(playlist.owner.id)
        }
      if(playlist.owner.id == user_ID)
      {
          myPlaylists.push(playlist)
      }
    }
    friendArray.sort((a,b) => (a).localeCompare(b))
    //This segment of code prunes the playlist of duplicates. This will make it all more efficient
    for(let i = 0; i < friendArray.length - 1; i++)
    {
      let count = 0;
      let j = i;
      let tempString = friendArray[i];
      while(friendArray[j+1] == tempString)
      {
        count++;
        j++;
      }
      if(count != 0)
      {
      friendArray.splice(i, count);
      }
    }

    populatePlaylists();
  }
  ).catch(e => console.error(e))
};

function populatePlaylists()
{
  let promiseArray = [];
  for(let i = 0; i < friendArray.length; i++)
  {
    promiseArray.push(spotifyApi.getUserPlaylists(friendArray[i], {
      limit: 50
    }))
  }
  Promise.all(promiseArray)
    .then(data =>
      //data.body.items is what returns the SimplifiedPlaylistObject
      {
        for(let i = 0; i < friendArray.length; i++)
        {
          data[i].body.items.forEach(playlist =>
            {
              if(friendArray.includes(playlist.owner.id))
              {
                playlistArray.push(playlist);
                //console.log("Playlist Name: "+ playlist.name + "    ID: " + playlist.id)
              }
            })
          }
      friendPlaylistLength = playlistArray.length;
      console.log("There are " + friendPlaylistLength + " playlists in the friendsPlaylists array\n") 

      populateMySongs();
      populateSongs();
    }
    ).catch(e => console.log(e)); 
  }

function populateMySongs()
{
  let promiseArray = [];
  for(let i = 0; i < myPlaylists.length; i++)
  {
    async function getTrackPromise() {
      const result = spotifyApi.getPlaylistTracks(myPlaylists[i].id,
        {
          limit : 100
        });
      return result;
    }
    promiseArray.push(getTrackPromise())
  }
  Promise.allSettled(promiseArray)
  .then(data =>
    {
      if(data.status != 'rejected')
      {
      for(let j = 0; j < myPlaylists.length; j++)
      {
        data[j].value.body.items.forEach(playlistTrack =>
         {
           if(playlistTrack.track != null && playlistTrack.track.id != null)
              {
                mySongs.push(playlistTrack.track.id)
              }
         })
      }

      //Sorts duplicates out of my playlists
      mySongs.sort((a,b) => (a).localeCompare(b))
      prune(mySongs);
    }
  }
  )
  .catch(e => console.log(e))
}



function populateSongs()
{
  let promiseArray = [];
  let countSuccess = 0;
  let tempLength = playlistArray.length

  for(let i = 0; i < playlistArray.length; i++)
  {
    async function getTrackPromise() {
      const result = spotifyApi.getPlaylistTracks(playlistArray[i].id,
        {
          limit : 100
        });
      return result;
    }
    promiseArray.push(getTrackPromise())
  }
  Promise.allSettled(promiseArray)
  .then(data =>
     {
       for(let j = 0; j < promiseArray.length; j++)
        {
          if(data[j].status == 'fulfilled')
          {
            data[j].value.body.items.forEach(playlistTrack =>
               {
                if(playlistTrack.track != null && playlistTrack.track.id != null)
                  {
                    megaSongs.push(playlistTrack.track.id)
                  }
               })
            countSuccess++;

            let tempID = data[j].value.body.href;
            let idToRemove = tempID.split("/")[5];
            for(let i = 0; i < playlistArray.length; i++)
              {
                if(playlistArray[i].id == idToRemove)
                  {
                   playlistArray.splice(i, 1);
                  }
              }
          }
        }

        countSorted += countSuccess;
        if(countSuccess != tempLength)
          {
            console.log("Unfulfilled promises, retrying in 8 seconds: " + countSorted + " / " + friendPlaylistLength)
            setTimeout(function(){
              populateSongs()
            }, 8000)
          }
        else
          {
            console.log("All playlists have been searched: " + countSorted + " / " + friendPlaylistLength)
            megaSongs.sort((a,b) => (a).localeCompare(b))

            prune(megaSongs);

            console.log(mySongs.length + " of my own songs are unique across " + myPlaylists.length + " playlists")
            console.log(megaSongs.length + " of my friends' songs are unique accross " + friendPlaylistLength + " playlists")
            
            findSharedSongs();
        }
  })
      .catch(e => console.log(e));
  }


  function findSharedSongs()
  {
    for(let i = 0; i < mySongs.length; i++)
    {
      let tempTrackID = mySongs[i];
      if(binarySearch(megaSongs, tempTrackID) != -1)
      {
        sharedSongs.push(tempTrackID)
      }
    }

    console.log("There are " + sharedSongs.length + " songs you both like");

    newPlaylist();
  }

  function newPlaylist()
  {
    let tempPlaylistID = '';

    //converts the Shared Songs into an array of URI objects
    for(let i = 0; i < sharedSongs.length; i++)
    {
      sharedSongs[i] = 'spotify:track:' + sharedSongs[i];
    }
    
    makePlaylist();

    async function makePlaylist()
    {
      console.log("Creating playlist...")
      const newPlaylistData = await spotifyApi.createPlaylist('API Project', {
      'description': 'Dude no way', 'collaborative' : false, 'public': true
        }).catch(e => console.log(e))
      tempPlaylistID = newPlaylistData.body.id
      fillPlaylist();
    }

    async function fillPlaylist()
    {
      let songCount = sharedSongs.length
      console.log("Filling playlist")

      for(let i = 0; i < 1 + (songCount/100); i++) //Will loop through the api call x amount of times.
      {
        let batchSongs = [];
        for(let j = 0; j < 100; j++)
          {
            if(sharedSongs[j] != null)
            {
            batchSongs.push(sharedSongs[j])
            sharedSongs.splice(j,1);
            } 
          }

        //pushes the song into the playlist
        spotifyApi.addTracksToPlaylist(tempPlaylistID, batchSongs)
        .then(console.log('Success! Playlist Populated!'))
        .catch(e => console.log(e));
     }
     console.log("Done populating songs!")
    }
}

function binarySearch(arr, search)
{
  let start = 0;
  let end = arr.length - 1;

  while(start <= end)
  {
    let middle = Math.floor((start + end) / 2)

    if(arr[middle].localeCompare(search) == 0)
    {
      return middle;
    }
    else if(arr[middle].localeCompare(search) < 0)
    {
      start = middle + 1;
    }
    else
    {
      end = middle -1;
    }
  }
  return -1;
}

  function prune(arr)
  {
    for(let i = 0; i < arr.length -1; i++)
    {
    let base = arr[i];
    while(base == arr[i+1])
    {
      arr.splice(i,1);
    }
    }
  }


/***************************************************************************************************************** */
const scopes = [
  'ugc-image-upload',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'streaming',
  'app-remote-control',
  'user-read-email',
  'user-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-read-private',
  'playlist-modify-private',
  'user-library-modify',
  'user-library-read',
  'user-top-read',
  'user-read-playback-position',
  'user-read-recently-played',
  'user-follow-read',
  'user-follow-modify'
];

const spotifyApi = new SpotifyWebApi({
  redirectUri: redirect_URL,
  clientId: client_ID,
  clientSecret: client_Secret
});

const app = express();

app.get('/login', (req, res) => {
  res.redirect(spotifyApi.createAuthorizeURL(scopes));
});

app.get('/callback', (req, res) => {
  
  const error = req.query.error;
  const code = req.query.code;
  const state = req.query.state;

  if (error) {
    console.error('Callback Error:', error);
    res.send(`Callback Error: ${error}`);
    return;
  }

  spotifyApi
    .authorizationCodeGrant(code)
    .then(data => {
      const access_token = data.body['access_token'];
      const refresh_token = data.body['refresh_token'];
      const expires_in = data.body['expires_in'];

      spotifyApi.setAccessToken(access_token);
      spotifyApi.setRefreshToken(refresh_token);

      console.log('access_token:', access_token);
      console.log('refresh_token:', refresh_token);

      console.log(`Sucessfully retreived access token. Expires in ${expires_in} s.\n`);



      getUserID()
      getFriends(getUserID(), 0)



      res.send('Success! You can now close the window.');

      setInterval(async () => {
        const data = await spotifyApi.refreshAccessToken();
        const access_token = data.body['access_token'];

        console.log('The access token has been refreshed!');
        console.log('access_token:', access_token);
        spotifyApi.setAccessToken(access_token);
      }, expires_in / 2 * 1000);
    })
    .catch(error => {
      console.error('Error getting Tokens:', error);
      res.send(`Error getting Tokens: ${error}`);
    });
});

app.listen(8888, () =>
  console.log(
    'HTTP Server up. Now go to http://localhost:8888/login in your browser.'
  )
);

