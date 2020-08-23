const netlifyIdentity = require('netlify-identity-widget')

export default {
  currentUser: netlifyIdentity.currentUser(),
  lastPage: '',
  currentBranch: '',
  collapased: true,

  commits: {},
  contentMetadatas: {},

  changedFiles: {
    'scanned/20180802_2年3紐。5組『倫理社会」前期定期試験1.jpg': {
      src: 'scanned/20180802_2年3紐。5組『倫理社会」前期定期試験1.jpg',
      subj: '倫理社会',
      tool_type: 'テスト',
      period: '前期定期',
      year: '2018',
      content_type: '',
      author: '',
      image_index: '',
      included_pages_num: '',
      fix_text: ''
    },
    'scanned/20180802_2年3紐。5組『倫理社会」前期定期試験2.jpg': {
      src: 'scanned/20180802_2年3紐。5組『倫理社会」前期定期試験2.jpg',
      subj: '',
      tool_type: '',
      period: '',
      year: '',
      content_type: '',
      author: '',
      image_index: '',
      included_pages_num: '',
      fix_text: ''
    }
  },

  setCommitCSV: {
    status: 'unrequested'
  },

  branches: {
    status: 'unrequested',
    data: {}
  },

  imageDatas: {},
  imageShas: {}
}

// state.imageShas[commitSha][directoryPath] = {
//   status: 'loaded',
//   data: {
//     '----.jpg': 'a40c3ee1ebd4aa6ae0479c47b93438b2'
//     '----.jpg': 'a40c3ee1ebd4aa6ae0479c47b93438b2'
//   }
// }
