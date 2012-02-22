var numOutstandingWikis = 0;
function domainToWiki(domain, cb) {
  if (domain in window.localStorage) {
    cb(true);
    return;
  }
  numOutstandingWikis ++;
  // so that we don't do the same work twice
  window.localStorage[domain] = '';
  var url = "http://en.wikipedia.org/w/api.php?action=parse&format=json&callback=?";
  var q = {page:domain, prop:"text", redirects:true};
  $.getJSON(url, q, function(data) {
    numOutstandingWikis--;
    if ('error' in data) {
      //window.localStorage[domain] = JSON.stringify({'name':domain});
      cb(false);
    } else if ('parse' in data) {

      name = data.parse.title
      els = $(data.parse.text['*']);
      info = null;
      for (var i = 0; i < els.length; i++) {
        el = $(els[i]);
        console.log(el);
        if (el.hasClass('infobox')) {
          info = el.html();
        }
      }
      window.localStorage[domain] = JSON.stringify({'name':name, 
                                                    'infobox':info});
      cb(true);
    } else {
      //window.localStorage[domain] = JSON.stringify({'name':domain});
      cb(false);
    }
     console.log("numOutstandingWikis="+numOutstandingWikis) ;
  });
}



function extractDomain(url) {
  var host = '';
  var domain = '';
  url.replace(/^http(s?):\/\/[\w\d\-\.]+[\/\:]/, function(h) {host = h});
  // check for ip addresses before checking for general domain name
  host.replace(/(\d{1,3}\.){3}\d{1,3}.$/, function(d) {domain = d});
  if (domain == '') 
    host.replace(/([\w\d\-]+\.){1}[\w\d\-]+.$/, function(d) {domain = d});
  if (domain == '')
    host.replace(/localhost.$/, function(d) {domain = d});
  // remove port or forward slash (: or /)
  domain = domain.substr(0, domain.length-1);
  if (domain == '') {
    console.log("whoops: " + url + "\t" + host);  
    return null;
  }
  return domain;
}


// @return timestamp of the most recent URL we have processed.  In microsecs
function lastProcessedTime() {
  var mspm = 1000 * 60; // microsec/minute
  var now = (new Date()).getTime();
  var ls = window.localStorage;
  if (!('_lastprocessedtime' in ls)) {
    // two weeks ago
    ls['_lastprocessedtime'] = now - ( mspm * 60 * 24 * 7 * 2);
  }
  return parseInt(ls['_lastprocessedtime']);
}


function iterateHistory(cb_htime, cb_done, startTime, endTime) {
  var interval = 1000 * 60 * 30; // 30 minutes
  var finalEndTime = endTime;
  var numOutstandingReq = 0;
  var data = {};
  endTime = Math.min(finalEndTime, startTime + interval);
  while (startTime < finalEndTime) {
    var query = {
      'text' : '',
      'startTime' : startTime,
      'endTime' : endTime
    };
    var hcallback = function(hitems) {
      for (var i = 0; i < hitems.length; i++) {
        var hitem = hitems[i];             
        var domain = extractDomain(hitem.url);
        if (domain == null) continue;
        if (!(domain in data)) 
          data[domain] = 0;
        data[domain] += hitem.visitCount;
        // any additional tasks
        cb_htime(hitem, data);
        domainToWiki(domain, function(tf) {})
      }


      numOutstandingReq--;
      console.log("numOutstandingReq=" + numOutstandingReq);
      if (numOutstandingReq == 0) cb_done(data);
    }
    numOutstandingReq++;
    chrome.history.search(query, hcallback);
        
    startTime = endTime;
    endTime = Math.min(finalEndTime, startTime + interval);
  }

}

function saveResults(data) {
  window.localStorage['_counts_'] = JSON.stringify(data);
}

function renderCompanyInfo(html, parenttr, domain) {
  domain = domain.replace(/[\.\_]/g, '-');
  try{
    info = $(html);
  } catch (e) {}
  div = $("<div></div>").append(info);
  td = $("<td></td>", {'colspan':2}).append(div);
  tr = $("<tr></tr>").append(td).attr('id', 'infobox_'+domain);

  parenttr.click(function(){$("#infobox_"+domain).toggle()});
  $("#content").append(tr);
  tr.hide();
  return tr;
}

function printResults(data) {
  // sort domains by count
  var domains = [];
  var totalvisits = 0;
  for (var domain in data) {
    domains.push(domain);
    totalvisits += data[domain];
  }
  domains.sort(function(a,b) {return data[b] - data[a];});



  $("#content").empty();
  var cleandata = [];
  for (var idx = 0; idx < domains.length; idx++) {
    domain = domains[idx];
    var name = domain, html = null;

    if (window.localStorage[domain]) {
      parsed = JSON.parse(window.localStorage[domain]);
      name = parsed.name;
      html = parsed.infobox;
    } else {
      continue;
    }

    cleandata.push( [name, data[domain]] );

    n = data[domain];
    h = $("<td/>").text(n).addClass('table_count');
    href = $("<a/>", {"href":"http://"+domain, "target":"_ipnew"}).text(name);
    d = $("<td/>", {'class': 'table_domain'}).append(href);
    tr = $("<tr/>").append(h).append(d);
    $("#content").append(tr);


    if (html != null) {
      renderCompanyInfo(html, tr, domain);      
    }


  }

  if (cleandata.length >= 9) {
    others = cleandata.slice(cleandata.length-8);
    othertotal = d3.sum(others, function(d){return d[1];});
    cleandata = cleandata.slice(0, 8);
    cleandata.push(['Others', othertotal]);
  }
  renderChart(cleandata);
}



function renderChart(data) {
  var getn = function(d) {return d[1];};
  var total = d3.sum(data, getn);
  var mincount = d3.min(data, getn);



  var w = 400,//(2 * total / mincount ),
      h = 1000;
  var y = d3.scale.linear().range([0, h]).domain([0, d3.sum(data, getn)]),
      c = d3.interpolateRgb('#98df8a', 'steelblue');
  c = d3.scale.ordinal().domain(data.map(function(d){return d[0]}))
      .range(colorbrewer.RdBu[9]);

  $("#graph").empty();
  var svg = d3.select("#graph").append("svg")
    .attr("width", w)
    .attr("height", h)
    .append("g");
//    .attr("transform", "translate(" + m[3] + "," + m[0] + ")");
  

  cum = 0;
  for (var i = 0; i < data.length; i++) {
    data[i].push(cum);
    cum += data[i][1];
  }

  svg.selectAll('g.bar')
    .data(data)
    .enter().append('rect')
      .attr('class', 'bar')
      .attr('height', 25)
      .attr('x', 150)//function(d, idx) {return idx * 50;})
      .attr('y', function(d, idx) {return idx*50})//return y(d[2])})
      .attr('width', function(d) {return Math.log(d[1]) / Math.log(total) * w;})
      .attr('fill', function(d) {return c(d[0]);})//d[2] / total)});

  svg.selectAll('g.text')
    .data(data)
    .enter().append('text')
      .attr('x', 30)
      .attr("class", "chart_label")
      .attr("y", function(d, idx) { return 50*idx+25})//return 5+y(d[2] + (d[1]/2.0))})
      .text(function(d) {return d[0].substring(0, 15);})

}





