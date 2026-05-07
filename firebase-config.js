// Firebase 설정 - 본인 프로젝트 정보로 교체
const firebaseConfig = {
  apiKey: "AIzaSyAjIylhIDFtjNBanVp6NBcTKao_LWQss54",
  authDomain: "bspcourse-634ba.firebaseapp.com",
  databaseURL: "https://bspcourse-634ba-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bspcourse-634ba",
  storageBucket: "bspcourse-634ba.firebasestorage.app",
  messagingSenderId: "206030425284",
  appId: "1:206030425284:web:becdf9886fae0d35a6cd91"
};

// Firebase compat SDK 로드 후 초기화
firebase.initializeApp(firebaseConfig);
const fbDb = firebase.database();
const fbAuth = firebase.auth();
