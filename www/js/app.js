
angular.module('geo-notes', ['ionic', 'ngCordova'])

  .factory('NoteService', function() {

    var fb = new Firebase("https://sweltering-fire-1231.firebaseio.com")
    var notes = fb.child('notes')
    var geos = fb.child('geos')
    var geo = new GeoFire(geos)

    return {

      fbNotes: notes,
      fbGeos: geos,
      fbGeo: geo,

      byArea: function() {
        return geo.query({
          center: [ 0, 0 ],
          radius: 1000
        })
      },

      fetch: function() {
      },

      create: function(raw) {
      }
    }
  })

  .run(function($ionicPlatform) {

    $ionicPlatform.ready(function() {
      if(window.cordova && window.cordova.plugins.Keyboard) {
        cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
      }
      if(window.StatusBar) {
        StatusBar.styleDefault();
      }
    });
  })

  .controller('GeoNotesController', function($scope, $ionicPlatform, $ionicModal, $cordovaGeolocation, NoteService) {

    $ionicPlatform.ready(function() {
      $cordovaGeolocation
        .watchPosition(options)
        .promise.then(function() { /*done*/ }, function() { /*error*/ }, userLocation.emit.bind(userLocation))
    })

    $scope.notes = [];

    var currentUserLocation
    var currentArea = NoteService.byArea()

    var llArray = function(pos) { return [ pos.coords.latitude, pos.coords.longitude ] }

    var userLocation = Kefir.emitter()
    userLocation.map(llArray).onValue(function(ll) {
      currentUserLocation = ll
      currentArea.updateCriteria({ center: ll })
    })

    currentArea.on('key_entered', function(k, l, d) {
      NoteService.fbNotes.child(k).once('value', function(snap) {
        var note = snap.val()
        note.name = snap.name()
        note.metersAway = GeoFire.distance(note.location, currentUserLocation) * 1000
        $scope.notes.push(note)
        $scope.$apply()
      })
    })

    currentArea.on('key_exited', function(k) {
      NoteService.fbNotes.child(k).once('value', function(snap) {
        $scope.notes = $scope.notes.filter(function(note) {
          return note.text !== snap.val().text
        })
      })
    })

    var options = {
      frequency : 1000,
      timeout : 5000,
      enableHighAccuracy: true
    };

    // Create and load the Modal
    $ionicModal.fromTemplateUrl('new-note.html', function(modal) {
      $scope.noteModal = modal;
    }, {
      scope: $scope,
      animation: 'slide-in-up'
    });

    // Called when the form is submitted
    $scope.createNote = function(raw) {
      var note = {
        text: raw.text,
        location: currentUserLocation,
        score: 10
      }
      $scope.noteModal.hide();
      raw.text = "";
      var created = NoteService.fbNotes.push(note)
      NoteService.fbGeo.set(created.name(), note.location)
    };

    $scope.upvote = function(note) {
      note.score += 10
      NoteService.fbNotes.child(note.name).update({ score: note.score })
    }

    // Open our new note modal
    $scope.newNote = function() {
      $scope.noteModal.show();
    };

    // Close the new note modal
    $scope.closeNewNote = function() {
      $scope.noteModal.hide();
    };
  })
