import React, { Component } from "react";
import Web3 from "web3";
import Emojify from "react-emojione";

import "./App.css";

const donationNetworkID = 1; // make sure donations only go through on this network.
const donationAddress = "0x85cab7143ff3c01b93e88f5b017692374bb939c2"; //replace with the address to watch
const apiKey = "IHZIQQIWSGIMDMTR7FC5N1C86BE1DIU6ZI"; //replace with your own key
const etherscanApiLink =
  "https://api.etherscan.io/api?module=account&action=txlist&address=" +
  donationAddress +
  "&startblock=0&endblock=99999999&sort=asc&apikey=" +
  apiKey;

const isSearched = searchTerm => item =>
  item.from.toLowerCase().includes(searchTerm.toLowerCase());

var myweb3;

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      ethlist: [],
      searchTerm: "",
      donateenabled: true,
      socketconnected: false,
      totalAmount: 0
    };
  }

  onSearchChange = event => {
    this.setState({
      searchTerm: event.target.value
    });
  };

  subscribe = address => {
    let ws = new WebSocket("wss://socket.etherscan.io/wshandler");

    function pinger(ws) {
      var timer = setInterval(function() {
        if (ws.readyState === 1) {
          ws.send(
            JSON.stringify({
              event: "ping"
            })
          );
        }
      }, 20000);
      return {
        stop: function() {
          clearInterval(timer);
        }
      };
    }

    ws.onopen = function() {
      this.setState({
        socketconnected: true
      });
      pinger(ws);
      ws.send(
        JSON.stringify({
          event: "txlist",
          address: address
        })
      );
    }.bind(this);
    ws.onmessage = function(evt) {
      let eventData = JSON.parse(evt.data);
      console.log(eventData);
      if (eventData.event === "txlist") {
        let newTransactionsArray = this.state.transactionsArray.concat(
          eventData.result
        );
        this.setState(
          {
            transactionsArray: newTransactionsArray
          },
          () => {
            this.processEthList(newTransactionsArray);
          }
        );
      }
    }.bind(this);
    ws.onerror = function(evt) {
      this.setState({
        socketerror: evt.message,
        socketconnected: false
      });
    }.bind(this);
    ws.onclose = function() {
      this.setState({
        socketerror: "socket closed",
        socketconnected: false
      });
    }.bind(this);
  };

  getAccountData = () => {
    return fetch(`${etherscanApiLink}`)
      .then(originalResponse => originalResponse.json())
      .then(responseJson => {
        return responseJson.result;
      });
  };

  handleDonate = event => {
    event.preventDefault();
    const form = event.target;
    let donateWei = new myweb3.utils.BN(
      myweb3.utils.toWei(form.elements["amount"].value, "ether")
    );
    let message = myweb3.utils.toHex(form.elements["message"].value);
    let extraGas = form.elements["message"].value.length * 68;

    myweb3.eth.net.getId().then(netId => {
      switch (netId) {
        case 1:
          console.log("Metamask is on mainnet");
          break;
        case 2:
          console.log("Metamask is on the deprecated Morden test network.");
          break;
        case 3:
          console.log("Metamask is on the ropsten test network.");
          break;
        case 4:
          console.log("Metamask is on the Rinkeby test network.");
          break;
        case 42:
          console.log("Metamask is on the Kovan test network.");
          break;
        default:
          console.log("Metamask is on an unknown network.");
      }
      if (netId === donationNetworkID) {
        return myweb3.eth.getAccounts().then(accounts => {
          return myweb3.eth
            .sendTransaction({
              from: accounts[0],
              to: donationAddress,
              value: donateWei,
              gas: 150000 + extraGas,
              data: message
            })
            .catch(e => {
              console.log(e);
            });
        });
      } else {
        console.log("no donation allowed on this network");
        this.setState({
          donateenabled: false
        });
      }
    });
  };

  processEthList = ethlist => {
    // let totalAmount = new myweb3.utils.BN(0);
    let filteredEthList = ethlist
      .map(obj => {
        obj.value = new myweb3.utils.BN(obj.value); // convert string to BigNumber
        return obj;
      })
      .filter(obj => {
        return obj.value.cmp(new myweb3.utils.BN(0));
      }) // filter out zero-value transactions
      .reduce((acc, cur) => {
        // group by address and sum tx value
        if (cur.isError !== "0") {
          // tx was not successful - skip it.
          return acc;
        }
        if (typeof acc[cur.from] === "undefined") {
          acc[cur.from] = {
            from: cur.from,
            value: new myweb3.utils.BN(0),
            input: cur.input,
            hash: []
          };
        }
        acc[cur.from].value = cur.value.add(acc[cur.from].value);
        acc[cur.from].input =
          cur.input !== "0x" && cur.input !== "0x00"
            ? cur.input
            : acc[cur.from].input;
        acc[cur.from].hash.push(cur.hash);
        return acc;
      }, {});
    filteredEthList = Object.keys(filteredEthList)
      .map(val => filteredEthList[val])
      .sort((a, b) => {
        // sort greatest to least
        return b.value.cmp(a.value);
      })
      .map((obj, index) => {
        // add rank
        obj.rank = index + 1;
        return obj;
      });
    const ethTotal = filteredEthList.reduce((acc, cur) => {
      return acc.add(cur.value);
    }, new myweb3.utils.BN(0));
    return this.setState({
      ethlist: filteredEthList,
      totalAmount: parseFloat(myweb3.utils.fromWei(ethTotal)).toFixed(2)
    });
  };

  componentDidMount = () => {
    if (
      typeof window.web3 !== "undefined" &&
      typeof window.web3.currentProvider !== "undefined"
    ) {
      myweb3 = new Web3(window.web3.currentProvider);
      myweb3.eth.defaultAccount = window.web3.eth.defaultAccount;
      this.setState({
        candonate: true
      });
    } else {
      // I cannot do transactions now.
      this.setState({
        candonate: false
      });
      myweb3 = new Web3();
    }

    this.getAccountData().then(res => {
      this.setState(
        {
          transactionsArray: res
        },
        () => {
          this.processEthList(res);
          this.subscribe(donationAddress);
        }
      );
    });
  };

  render = () => {
    return (
      <div className="App container">
        <div class="jumbotron jumbotron-fluid">
          <div className='row text-center'>
            <div className='col-sm-12 xs-font-sm'>
              <h1 className='big-title cursive'>
                <small>The</small> Fellowship <small>of</small> <br/> Ethereum Magicians
                  <img
                  src="/img/fellowship-logomark.png"
                  className="sparkle align-top"
                  alt="ethmagicians logo"
                />
              </h1>
            </div>
          </div>
        </div>
        <div className="row">
          <div className="col-sm-12">
            <div>
              <div className='row justify-content-md-center'>
                <div className='col-sm-8 col-sm-offset-2'>
                  <h2 className='text-center'>We are a volunteer group.</h2>
                </div>
              </div>
              <div className='row text-center'>
                <div className='col-sm-4'>
                  <h3>
                    Goal
                  </h3>
                  <p>
                    To keep Ethereum the <strong>best</strong> it can technically be.
                  </p>
                </div>
                <div className='col-sm-4'>
                  <h3>
                    Mission
                  </h3>
                  <p>
                    To nurture community consensus on the technical direction and specification of Ethereum.
                  </p>
                </div>
                <div className='col-sm-4'>
                  <h3>
                    Work
                  </h3>
                  <p>
                    Primarily, high-quality Ethereum Improvement Proposals (EIPs), accepted by a consensus of the Community.
                  </p>
                </div>
              </div>
              <div>
                <div>
                  <p className='text-center'>
                      We run a <a target="_blank"
                            rel="noopener noreferrer" href="https://ethereum-magicians.org/">community forum</a> and events. Read the <a target="_blank"
                                  rel="noopener noreferrer" href="https://goo.gl/DrJRJV">Fellowship Proposal</a> for more information.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="row">
          <div className="col-sm-12">
            <div className='row justify-content-md-center'>
              <div className='col-sm-8 col-sm-offset-2'>
                <h2 className='text-center'>We Meet at Tri-Annual Events.</h2>
              </div>
            </div>

            <p>
              <span className='dropcap'>E</span><span className='smallcaps'>vents are</span> open to <strong>everyone</strong>.  We ask for registration to help with communication and to order the right amount of refreshments. We rely on donations and sponsorships to run events, as well as a sponsoring Host organization for each meeting. We recognize and thank all of the organizational and individual sponsorships and donations. As an individual, we recommend a {""}
                <strong>minimum donation of 0.1 ETH</strong> per event.
            </p>
          </div>
        </div>


        <hr />

        <blockquote class="blockquote text-center">
          By donating you support open source projects like this{" "}
          <a href="https://github.com/giveth/donation-leaderboard" target="_blank"
                    rel="noopener noreferrer">
            donation leaderboard application
          </a>.
        </blockquote>

        <hr />

        <div className="row">
          <div className="col-sm-12">
            <div className='row justify-content-md-center'>
              <div className='col-sm-8 col-sm-offset-2'>
                <h2 className='text-center'>Ways to Donate</h2>
              </div>
            </div>


            <div className='donate-card card'>
              <div className='card-body'>
                <h4 className='card-title'>Publically</h4>
                <p>
                  Send a transaction via Metamask with your Team Name or other info as a message:
                </p>

                <form onSubmit={this.handleDonate} className='form-inline'>
                  <label className="sr-only" for='amount'>ETH to Donate</label>
                  <input
                    type="text"
                    className='form-control mb-2 mr-sm-2'
                    placeholder="ETH to donate"
                    name="amount"
                  />
                  <input
                    type="text"
                    className='form-control mb-2 mr-sm-2'
                    placeholder="Message"
                    name="message" />
                  <button type='submit' className="btn btn-primary mb-2">Send</button>
                </form>
              </div>
            </div>

            <div className='donate-card card'>
              <div className='card-body'>
                <h4 className='card-title'>Privately</h4>

                <p>Send directly to the donation address <strong className="donation-address mono">{donationAddress}</strong></p>

                <img
                  src="/img/0x85cab7143ff3c01b93e88f5b017692374bb939c2.png"
                  className="qr-code"
                  alt="Donation QR Code"
                />
              </div>
            </div>
          </div>
        </div>

        <div className='jumbotron'>
          <h1 className='text-center'>{this.state.totalAmount} ETH Donated</h1>
        </div>

        <div className='row'>
          <div className="col-sm-12">
            <div className='table-responsive'>
              <table className="table table-striped table-hover table-bordered">
                <thead className="pagination-centered">
                  <tr>
                    <th>Rank</th>
                    <th>Address</th>
                    <th>Value</th>
                    <th>Message</th>
                    <th>Tx Link</th>
                  </tr>
                </thead>
                <tbody>
                  {this.state.ethlist
                    .filter(isSearched(this.state.searchTerm))
                    .map(item => (
                      <tr key={item.hash} className="Entry">
                        <td>{item.rank} </td>
                        <td className='mono'>{item.from} </td>
                        <td>{myweb3.utils.fromWei(item.value)} ETH</td>
                        <td>
                          <Emojify>{myweb3.utils.hexToAscii(item.input)}</Emojify>
                        </td>
                        <td>
                          {item.hash.map((txHash, index) => (
                            <a
                              key={index}
                              href={"https://etherscan.io/tx/" + txHash}
                            >
                              [{index + 1}]
                            </a>
                          ))}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }; // End of render()
} // End of class App extends Component

export default App;
